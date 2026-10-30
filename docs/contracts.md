# API & MQTT Contract — SacDau

Đây là **hợp đồng bắt buộc** giữa IoT, Backend, Frontend, GIS. Field đã chốt ở đây **không tự đổi tên/kiểu dữ liệu** — cần đổi gì thì báo nhóm, sửa ở file này trước, rồi cả 3 người sửa code theo, không sửa code trước rồi mới báo.

Khớp với schema DB thật đã migrate ở `backend/migrations/1791819717249_init.js` (bảng `users`, `stations`, `ports`, `bookings`, `charging_sessions`, `telemetry`, `audit_logs`).

> **Cập nhật mô hình nghiệp vụ (2026-10-29):** Bỏ mô hình marketplace (chủ trạm tự đăng ký trạm độc lập). Chuyển sang mô hình **1 công ty vận hành nhiều trạm sạc**: `admin` tạo/sửa/xoá trạm và phân công `ownerId` cho nhân viên quản lý (`owner`); `owner` không tự tạo trạm, chỉ quản lý các trạm được phân công. Không đổi schema DB (`stations.owner_id` đã có sẵn từ migration gốc). Chi tiết: mục 1b (WebSocket), mục 3 (object `Station`/`ChargingSession`), mục 4 (endpoint `/stations`, `/bookings`, `/payments`).

---

## 0. Quy ước chung (áp dụng cho mọi API)

| Quy ước | Giá trị |
|---|---|
| Format field trong JSON (API) | `camelCase` (ví dụ `powerKw`, `stationId`) |
| Format cột trong DB | `snake_case` (ví dụ `power_kw`, `station_id`) — **backend chịu trách nhiệm map 2 chiều**, FE/IoT không cần biết tên cột DB |
| Ngày giờ | chuỗi ISO 8601, luôn có timezone UTC (`Z`) — ví dụ `"2026-10-12T10:00:00Z"` |
| Số | kiểu `number` thật trong JSON, không gửi dạng string (`"7.4"` ❌, `7.4` ✅) |
| Auth header | `Authorization: Bearer <accessToken>` |
| Response envelope | xem mục 2 — **mọi** endpoint REST phải trả đúng khung này, không ngoại lệ |

---

## 1. MQTT — thiết bị gửi lên broker

**Chỉ 1 topic duy nhất**, thiết bị không tự tính phiên sạc — backend tự suy ra `charging_sessions` từ các lần đổi `status` liên tiếp (idle → charging = bắt đầu phiên, charging → idle = kết thúc phiên). Lý do: giữ phần code ESP32 đơn giản nhất có thể.

**Topic:** `stations/{stationId}/status`

```json
{
  "stationId": "ST01",
  "portId": 1,
  "status": "charging",
  "powerKw": 7.4,
  "energyKwh": 12.3,
  "temperature": 29.5,
  "timestamp": "2026-10-12T10:00:00Z"
}
```

| Field | Kiểu | Giá trị hợp lệ | Ghi chú |
|---|---|---|---|
| `stationId` | string | ví dụ `"ST01"` | mã trạm, không phải `id` số trong DB — backend tự tra `stations.id` theo mã này |
| `portId` | number | số nguyên, đếm từ 1 | khớp `ports.port_number` |
| `status` | string enum | `idle` \| `charging` \| `fault` | |
| `powerKw` | number | ≥ 0 | công suất hiện tại |
| `energyKwh` | number | ≥ 0 | điện năng tích lũy của phiên hiện tại |
| `temperature` | number | | nếu không có cảm biến DHT22 thì gửi `null` |
| `timestamp` | string | ISO 8601 UTC | giờ thiết bị ghi nhận, không phải giờ broker nhận |

Backend lưu nguyên payload này vào bảng `telemetry` (map `powerKw`→`power_kw`, `energyKwh`→`energy_kwh`, `timestamp`→`recorded_at`).

**Quy tắc xử lý trên backend khi nhận bản tin (đã chốt — IoT → Server 1 chiều, server không gửi lệnh điều khiển ngược xuống ESP32):**

1. Luôn `INSERT` một bản ghi mới vào `telemetry`, rồi cập nhật `ports.status = payload.status`.
2. `status = "charging"` và port **chưa** có phiên mở (`charging_sessions` với `port_id` này và `ended_at IS NULL`) → mở phiên mới:
   - Tìm `bookings` cùng `port_id`, `status = 'confirmed'`, thỏa `start_time <= now <= end_time` để gán `booking_id`.
   - **Không tìm thấy booking khớp vẫn mở phiên bình thường** với `booking_id = NULL` (khách vãng lai, không đặt chỗ trước).
   - `energy_kwh` lấy từ `payload.energyKwh` (quy ước ESP32 gửi `0` khi vừa cắm sạc/bắt đầu phiên mới).
3. `status = "charging"` và port **đã** có phiên mở → chỉ cập nhật `energy_kwh = payload.energyKwh` (phiên có thể kéo dài quá `endTime` dự kiến của booking, vẫn tiếp tục mở cho tới khi nhận `idle`/`fault`).
4. `status = "idle"` hoặc `status = "fault"` và port đang có phiên mở → đóng phiên: `ended_at = now`, `energy_kwh = payload.energyKwh ?? energy_kwh hiện tại`, `cost = energy_kwh * UNIT_PRICE_PER_KWH` (hằng số đơn giá, mặc định `3500` VNĐ/kWh — thêm biến `UNIT_PRICE_PER_KWH` vào `backend/.env.example`).
5. Sau mỗi bước 2–4, phát sự kiện WebSocket cho frontend (xem mục 1b).

**Mock khi chưa có ESP32 thật:** dùng `iot/mock/mockPublisher.js` (đã mô tả ở `QUY_TAC_LAM_VIEC_NHOM.md` mục 6a), publish đúng payload trên.

---

## 1b. WebSocket — đẩy trạng thái real-time (Backend → Frontend)

Không theo envelope `success/data/error` ở mục 2 (đây là sự kiện WS, không phải response HTTP). Kênh public, không yêu cầu token (giống `GET /stations`, chỉ là xem trạng thái).

| Event | Payload | Khi nào phát |
|---|---|---|
| `port:update` | `{ stationId, portId, status, powerKw, energyKwh, temperature, recordedAt }` | Mỗi khi backend nhận bản tin MQTT và cập nhật `ports.status` (bước 1 ở mục 1) |
| `session:update` | object `ChargingSession` (mục 3) | Mỗi khi phiên sạc được mở/cập nhật/đóng (bước 2–4 ở mục 1) |

Thư viện dùng `ws` hoặc `socket.io` (chốt ở `TECH_STACK.md` mục 2.2) — tên event/payload ở trên là hợp đồng cố định, không phụ thuộc thư viện chọn.

---

## 2. REST API — response envelope (bắt buộc cho mọi endpoint)

**Thành công:**

```json
{ "success": true, "data": { }, "error": null }
```

**Lỗi:**

```json
{ "success": false, "data": null, "error": { "code": "STATION_NOT_FOUND", "message": "Không tìm thấy trạm" } }
```

### Danh sách `error.code` chuẩn (không tự đặt code mới ngoài danh sách, muốn thêm phải báo nhóm)

| Code | HTTP status | Khi nào dùng |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Body/query không đúng định dạng |
| `UNAUTHORIZED` | 401 | Thiếu token hoặc token sai/hết hạn |
| `FORBIDDEN` | 403 | Có token nhưng không đủ quyền (RBAC) hoặc không sở hữu tài nguyên (chống IDOR) |
| `NOT_FOUND` | 404 | ID không tồn tại (generic) |
| `STATION_NOT_FOUND` | 404 | Riêng cho `/stations/:id` |
| `STATION_CODE_ALREADY_EXISTS` | 409 | `POST /stations` với `code` đã tồn tại *(thêm khi code hoá, mô hình nghiệp vụ mới)* |
| `PORT_UNAVAILABLE` | 409 | Đặt chỗ vào port đang `charging`/`fault` |
| `BOOKING_CONFLICT` | 409 | Trùng khung giờ đặt chỗ (cùng `port_id`, booking khác chưa `cancelled`) |
| `BOOKING_CANCEL_NOT_ALLOWED` | 400 | Hủy booking đã `cancelled` hoặc đã quá giờ `startTime` *(thêm 2026-10-29, mô hình nghiệp vụ mới)* |
| `EMAIL_ALREADY_EXISTS` | 409 | Đăng ký hoặc đổi email trùng với tài khoản khác *(thêm 2026-10-13, Phase 3)* |
| `TOO_MANY_REQUESTS` | 429 | Vượt giới hạn tần suất (hiện áp cho `/auth/login`, chống brute force) *(thêm 2026-10-14, Phase 4)* |
| `INTERNAL_ERROR` | 500 | Lỗi server không xác định |

---

## 3. Object chuẩn (JSON trả về từ API — đã map sang camelCase)

### User

```json
{ "id": 1, "name": "Nguyễn Văn A", "email": "a@example.com", "role": "driver" }
```

`role` ∈ `driver` \| `owner` \| `admin`. **Không bao giờ** trả `passwordHash` ra API.

### Station

```json
{
  "id": 1,
  "name": "Trạm Cầu Giấy",
  "ownerId": 2,
  "location": { "lat": 21.0368, "lng": 105.7829 },
  "ports": [{ "id": 10, "portNumber": 1, "status": "idle" }],
  "createdAt": "2026-10-01T00:00:00Z"
}
```

`location` map từ cột `geom` (PostGIS `GEOMETRY(Point,4326)`) qua `ST_X`/`ST_Y`. GIS/Frontend chỉ thấy `{lat, lng}`, không cần biết PostGIS.

`ownerId` = tài khoản `owner` được **admin phân công** quản lý trạm này (không phải người tự tạo trạm — xem mô hình nghiệp vụ ở đầu file). Có thể `null` nếu trạm chưa được phân công ai quản lý.

Station còn có cột `code` (mã trạm IoT gửi lên MQTT, vd `"ST01"` — xem mục 1) nhưng **không trả ra qua API** (chỉ dùng nội bộ để backend tra cứu khi nhận bản tin MQTT), tránh lộ thêm field ngoài hợp đồng đã chốt.

### Port

```json
{ "id": 10, "stationId": 1, "portNumber": 1, "status": "charging" }
```

`status` ∈ `idle` \| `charging` \| `fault`.

### Booking

```json
{
  "id": 5,
  "userId": 1,
  "portId": 10,
  "startTime": "2026-10-13T08:00:00Z",
  "endTime": "2026-10-13T09:00:00Z",
  "status": "pending",
  "createdAt": "2026-10-12T10:00:00Z"
}
```

`status` ∈ `pending` \| `confirmed` \| `cancelled`.

### ChargingSession

```json
{
  "id": 7,
  "bookingId": 5,
  "portId": 10,
  "startedAt": "2026-10-13T08:00:05Z",
  "endedAt": "2026-10-13T08:55:00Z",
  "energyKwh": 11.2,
  "cost": 56000
}
```

`endedAt`/`cost` có thể `null` khi phiên đang chạy. `bookingId` có thể `null` — phiên sạc vãng lai (tài xế cắm sạc không qua đặt chỗ trước); phiên vãng lai **không thanh toán được qua hệ thống** (không có tài xế gắn với phiên để xác định quyền thanh toán, xem mục 4).

### Payment

```json
{
  "id": 1,
  "chargingSessionId": 7,
  "amount": 56000,
  "status": "success",
  "vnpayTxnRef": "SACDAU17918230000",
  "vnpayTransactionNo": "14231456",
  "paidAt": "2026-10-13T09:00:00Z"
}
```

`status` ∈ `pending` \| `success` \| `failed`. `vnpayTransactionNo`/`paidAt` chỉ có khi `status = success`.

---

## 4. Danh sách endpoint (nhóm theo người phụ trách — khớp `QUY_TAC_LAM_VIEC_NHOM.md` mục 2)

### Người 2 — `/auth`, `/users`, `/bookings`, `/reports`

| Method | Path | Body | `data` trả về |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password, role }` — `role` chỉ nhận `driver`/`owner`; admin tạo bằng `npm run create-admin` | `{ user: User, accessToken, refreshToken }` |
| POST | `/auth/login` | `{ email, password }` | `{ user: User, accessToken, refreshToken }` |
| POST | `/auth/refresh` | `{ refreshToken }` | `{ accessToken }` |

Access token hết hạn sau 15 phút, refresh token sau 7 ngày (ký bằng 2 secret khác nhau, không dùng lẫn được). Access token hết hạn → gọi `/auth/refresh`; refresh cũng hết hạn → bắt đăng nhập lại.

| GET | `/users/me` | — | `User` |
| GET | `/users` *(admin)* | — | `User[]` |
| PATCH | `/users/:id` *(chính chủ hoặc admin)* | `{ name?, email? }` | `User` |
| POST | `/bookings` | `{ portId, startTime, endTime }` | `Booking` |
| GET | `/bookings/me` | — | `Booking[]` |
| PATCH | `/bookings/:id/cancel` | — | `Booking` |
| GET | `/reports/revenue?from=&to=` | — | `{ totalRevenue, totalSessions, byStation: [{ stationId, revenue }] }` |
| GET | `/reports/usage?from=&to=` | — | `{ byHour: [{ hour, count }], byStation: [{ stationId, count }] }` |

**Quy tắc `/bookings` (đã chốt):** `startTime >= hiện tại` và `endTime > startTime` (sai → `400 VALIDATION_ERROR`); trùng khung giờ với booking khác cùng `port_id` (status khác `cancelled`) → `409 BOOKING_CONFLICT`; không trùng → tạo ngay `status = 'confirmed'` (bỏ qua bước `pending`, xác nhận ngay không cần duyệt). Hủy (`PATCH /bookings/:id/cancel`) chỉ hợp lệ khi: booking thuộc chính tài xế gọi API, chưa `cancelled`, và còn **trước** giờ `startTime` — vi phạm → `400 BOOKING_CANCEL_NOT_ALLOWED` (không thuộc về mình → `403 FORBIDDEN`, không tồn tại → `404 NOT_FOUND`).

### Người 3 — `/stations`

Mô hình mới: chỉ **admin** tạo/xoá trạm và phân công người quản lý; **owner** chỉ xem/sửa thông tin vận hành của trạm mình được phân công (`stations.owner_id === req.user.id`), không tự tạo trạm.

| Method | Path | Body/Query | `data` trả về |
|---|---|---|---|
| GET | `/stations` | query `?near=lat,lng&radiusKm=` *(tùy chọn, dùng PostGIS `ST_DWithin`)* — public, không cần đăng nhập | `Station[]` |
| GET | `/stations/:id` | — — public | `Station` kèm `ports[]` |
| POST | `/stations` *(chỉ admin)* | `{ name, code, lat, lng, portsCount? }` — `code` là mã trạm IoT gửi lên MQTT (vd `"ST01"`), `portsCount` mặc định `1`, tạo kèm N cổng đánh số 1..N | `Station` |
| PATCH | `/stations/:id` *(owner được phân công/admin)* | `{ name?, lat?, lng? }` | `Station` |
| DELETE | `/stations/:id` *(chỉ admin)* | — | — |
| PATCH | `/stations/:id/assign-owner` *(chỉ admin)* | `{ ownerId }` | `Station` |

### Người 1 (ingest qua MQTT) + Người 2 (expose đọc) — `/sessions`

| Method | Path | `data` trả về |
|---|---|---|
| GET | `/sessions/:id` | `ChargingSession` |
| GET | `/stations/:id/sessions` | `ChargingSession[]` |

### Người 2 — `/payments` (VNPay sandbox)

Thanh toán xảy ra **sau khi phiên sạc kết thúc** (`charging_sessions.cost` đã có giá trị cuối), không thanh toán lúc đặt chỗ.

**Điều kiện được tạo thanh toán (`POST /payments`):** `ended_at IS NOT NULL`, `cost > 0`, chưa có bản ghi `payments` nào `status = 'success'` cho phiên này, và phiên phải gắn với tài xế đang đăng nhập qua `charging_sessions.booking_id → bookings.user_id === req.user.id`. Phiên vãng lai (`bookingId = null`) không đủ điều kiện — nằm ngoài phạm vi thanh toán online (xem mục 3 object `ChargingSession`).

| Method | Path | Body | `data` trả về |
|---|---|---|---|
| POST | `/payments` | `{ chargingSessionId }` | `{ paymentUrl }` — link redirect sang VNPay sandbox |
| GET | `/payments/:id` | — | `Payment` |

**2 route đặc biệt — KHÔNG theo envelope `success/data/error` chuẩn**, vì định dạng do VNPay quy định, không phải do mình tự chọn:

- `GET /payments/vnpay-return` — VNPay redirect **trình duyệt của người dùng** về đây kèm query `vnp_*` + `vnp_SecureHash`. Backend verify hash (HMAC-SHA512 bằng `VNPAY_HASH_SECRET`), update `payments.status`, rồi **redirect tiếp** về frontend (`/payment-result?status=success|failed`) — không trả JSON.
- `GET /payments/vnpay-ipn` — VNPay **server** gọi ngầm (không phải người dùng) để xác nhận giao dịch thật, bằng **GET** (tài liệu chính thức VNPay: mục IPN, "Phương thức: GET" — không phải POST). Backend verify hash tương tự, rồi **phải trả đúng format VNPay yêu cầu**: `{ "RspCode": "00", "Message": "Confirm Success" }` (hoặc code lỗi tương ứng) — sai format này VNPay sẽ coi là thất bại và gọi lại nhiều lần.

Thêm `error.code`: `PAYMENT_NOT_FOUND` (404), `INVALID_SIGNATURE` (400 — hash VNPay gửi về không khớp, nghi giả mạo), `PAYMENT_ALREADY_PROCESSED` (409 — IPN gọi lại cho giao dịch đã xử lý xong).

**Biến môi trường cần thêm** (`backend/.env.example`): `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_URL` (endpoint sandbox), `VNPAY_RETURN_URL` (URL backend xử lý return, ví dụ `http://localhost:3000/payments/vnpay-return`).

> ⚠️ `VNPAY_TMN_CODE` và `VNPAY_HASH_SECRET` phải tự đăng ký tài khoản sandbox tại `sandbox.vnpayment.vn` (cần người trong nhóm tự làm, không ai tạo giùm được) — khi có thì điền vào `.env` thật, **không commit lên git**.

---

## 5. Quy tắc thay đổi contract

- Field/endpoint nào đã chốt ở đây mà cần đổi tên, đổi kiểu, hoặc xoá → **báo nhóm trước**, sửa file này trước, rồi cả 3 người cùng sửa code theo. Không đổi code trước rồi báo sau.
- Thêm **field mới** (không đổi field cũ) không cần họp — chỉ cần thêm vào đây rồi báo nhóm 1 câu trong chat để người khác biết.
- Mọi route backend viết ra **phải** đúng response envelope ở mục 2 — xem `backend/src/routes/health.js` làm mẫu.
