# API & MQTT Contract — SacDau

Đây là **hợp đồng bắt buộc** giữa IoT, Backend, Frontend, GIS. Field đã chốt ở đây **không tự đổi tên/kiểu dữ liệu** — cần đổi gì thì báo nhóm, sửa ở file này trước, rồi cả 3 người sửa code theo, không sửa code trước rồi mới báo.

Khớp với schema DB thật đã migrate ở `backend/migrations/1791819717249_init.js` (bảng `users`, `stations`, `ports`, `bookings`, `charging_sessions`, `telemetry`, `audit_logs`).

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

**Mock khi chưa có ESP32 thật:** dùng `iot/mock/mockPublisher.js` (đã mô tả ở `QUY_TAC_LAM_VIEC_NHOM.md` mục 6a), publish đúng payload trên.

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
| `PORT_UNAVAILABLE` | 409 | Đặt chỗ vào port đang `charging`/`fault` |
| `BOOKING_CONFLICT` | 409 | Trùng khung giờ đặt chỗ |
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

`endedAt`/`cost` có thể `null` khi phiên đang chạy.

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

### Người 3 — `/stations`

| Method | Path | Body/Query | `data` trả về |
|---|---|---|---|
| GET | `/stations` | query `?near=lat,lng&radiusKm=` *(tùy chọn, dùng PostGIS `ST_DWithin`)* | `Station[]` |
| GET | `/stations/:id` | — | `Station` |
| POST | `/stations` *(owner/admin)* | `{ name, lat, lng }` | `Station` |
| PATCH | `/stations/:id` *(owner/admin)* | `{ name?, lat?, lng? }` | `Station` |

### Người 1 (ingest qua MQTT) + Người 2 (expose đọc) — `/sessions`

| Method | Path | `data` trả về |
|---|---|---|
| GET | `/sessions/:id` | `ChargingSession` |
| GET | `/stations/:id/sessions` | `ChargingSession[]` |

### Người 2 — `/payments` (VNPay sandbox)

Thanh toán xảy ra **sau khi phiên sạc kết thúc** (`charging_sessions.cost` đã có giá trị cuối), không thanh toán lúc đặt chỗ.

| Method | Path | Body | `data` trả về |
|---|---|---|---|
| POST | `/payments` | `{ chargingSessionId }` | `{ paymentUrl }` — link redirect sang VNPay sandbox |
| GET | `/payments/:id` | — | `Payment` |

**2 route đặc biệt — KHÔNG theo envelope `success/data/error` chuẩn**, vì định dạng do VNPay quy định, không phải do mình tự chọn:

- `GET /payments/vnpay-return` — VNPay redirect **trình duyệt của người dùng** về đây kèm query `vnp_*` + `vnp_SecureHash`. Backend verify hash (HMAC-SHA512 bằng `VNPAY_HASH_SECRET`), update `payments.status`, rồi **redirect tiếp** về frontend (`/payment-result?status=success|failed`) — không trả JSON.
- `POST /payments/vnpay-ipn` — VNPay **server** gọi ngầm (không phải người dùng) để xác nhận giao dịch thật. Backend verify hash tương tự, rồi **phải trả đúng format VNPay yêu cầu**: `{ "RspCode": "00", "Message": "Confirm Success" }` (hoặc code lỗi tương ứng) — sai format này VNPay sẽ coi là thất bại và gọi lại nhiều lần.

Thêm `error.code`: `PAYMENT_NOT_FOUND` (404), `INVALID_SIGNATURE` (400 — hash VNPay gửi về không khớp, nghi giả mạo), `PAYMENT_ALREADY_PROCESSED` (409 — IPN gọi lại cho giao dịch đã xử lý xong).

**Biến môi trường cần thêm** (`backend/.env.example`): `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_URL` (endpoint sandbox), `VNPAY_RETURN_URL` (URL backend xử lý return, ví dụ `http://localhost:3000/payments/vnpay-return`).

> ⚠️ `VNPAY_TMN_CODE` và `VNPAY_HASH_SECRET` phải tự đăng ký tài khoản sandbox tại `sandbox.vnpayment.vn` (cần người trong nhóm tự làm, không ai tạo giùm được) — khi có thì điền vào `.env` thật, **không commit lên git**.

---

## 5. Quy tắc thay đổi contract

- Field/endpoint nào đã chốt ở đây mà cần đổi tên, đổi kiểu, hoặc xoá → **báo nhóm trước**, sửa file này trước, rồi cả 3 người cùng sửa code theo. Không đổi code trước rồi báo sau.
- Thêm **field mới** (không đổi field cũ) không cần họp — chỉ cần thêm vào đây rồi báo nhóm 1 câu trong chat để người khác biết.
- Mọi route backend viết ra **phải** đúng response envelope ở mục 2 — xem `backend/src/routes/health.ts` làm mẫu.
