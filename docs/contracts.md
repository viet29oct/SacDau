# API & MQTT Contract — SacDau

Đây là **hợp đồng bắt buộc** giữa IoT, Backend, Frontend, GIS. Field đã chốt ở đây **không tự đổi tên/kiểu dữ liệu** — cần đổi gì thì báo nhóm, sửa ở file này trước, rồi cả 3 người sửa code theo, không sửa code trước rồi mới báo.

Khớp với schema DB thật ở `backend/migrations/` (bảng `users`, `stations`, `ports`, `bookings`, `charging_sessions`, `telemetry`, `audit_logs`, `payments`, `incidents`). Lý do đằng sau từng luật (cọc, check-in, phiên trái phép...): `docs/LUONG_NGHIEP_VU.md`.

---

## 0. Quy ước chung (áp dụng cho mọi API)

| Quy ước | Giá trị |
|---|---|
| Format field trong JSON (API) | `camelCase` (ví dụ `powerKw`, `stationId`) |
| Format cột trong DB | `snake_case` — **backend chịu trách nhiệm map 2 chiều** |
| Ngày giờ | chuỗi ISO 8601, luôn có timezone UTC (`Z`). Giờ phục vụ (6h–22h) tính theo giờ Việt Nam (UTC+7) |
| Số | kiểu `number` thật trong JSON, không gửi dạng string |
| Tiền | số nguyên VNĐ |
| Auth header | `Authorization: Bearer <accessToken>` |
| Response envelope | xem mục 2 — **mọi** endpoint REST phải trả đúng khung này (trừ 3 route VNPay ở mục 4) |

---

## 1. MQTT — thiết bị gửi lên broker

**Chỉ 1 topic duy nhất**, thiết bị không tự tính phiên sạc — backend tự suy ra `charging_sessions` từ chuỗi `status`. Server **không gửi lệnh ngược xuống** thiết bị (IoT 1 chiều).

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
| `stationId` | string | ví dụ `"ST01"` | mã trạm (`stations.code`), **phải trùng** `{stationId}` trên topic |
| `portId` | number | số nguyên ≥ 1 | khớp `ports.port_number` |
| `status` | string enum | `idle` \| `charging` \| `fault` | xem ý nghĩa bên dưới |
| `powerKw` | number | 0 – 22 | công suất hiện tại |
| `energyKwh` | number | ≥ 0 | điện năng tích luỹ của phiên hiện tại, **chỉ tăng**, về `0` khi bắt đầu phiên mới |
| `temperature` | number \| null | | không có cảm biến/đọc lỗi thì gửi `null` |
| `timestamp` | string \| null | ISO 8601 UTC | chưa đồng bộ NTP thì gửi `null` |

**Ý nghĩa `status` (bắt buộc):**
- `charging` = **súng đang cắm** — kể cả khi pin đã đầy (`powerKw ≈ 0`). Không chuyển về `idle` khi pin đầy.
- `idle` = **đã rút súng**. Thiết bị phải gửi trong ≤ 5 giây sau khi rút.
- `fault` = lỗi thiết bị (quá nhiệt, hỏng...).

**Tần suất:** publish **ngay khi đổi trạng thái**, và định kỳ (heartbeat) ≤ 10 giây/lần. Quá 60 giây không có bản tin → backend coi cổng là offline.

**Xác thực broker:** mỗi trạm 1 tài khoản MQTT, **username = mã trạm** (vd `ST01`), chỉ được publish vào `stations/<mã trạm>/status` (ACL `pattern write stations/%u/status` ở Mosquitto). Backend dùng tài khoản `sacdau_backend`, chỉ subscribe `stations/+/status`. Không cho kết nối ẩn danh. Cách tạo tài khoản: `mosquitto/README.md`.

**Quy tắc xử lý trên backend** (chi tiết: `docs/LUONG_NGHIEP_VU.md` mục 8):

1. Payload sai schema, `stationId` khác mã trạm trên topic, hoặc cổng không tồn tại → bỏ, ghi log.
2. Luôn `INSERT` vào `telemetry` (`recorded_at` = `timestamp` của thiết bị nếu lệch ≤ 5 phút so với giờ server, ngược lại = giờ server), cập nhật `ports.status` và `ports.last_seen_at` (= giờ server lúc nhận).
3. `charging` và cổng chưa có phiên mở → mở phiên mới, chụp `unit_price` lúc mở. Gán booking **chỉ khi** có booking `checked_in` trên cổng này, check-in trong vòng 15 phút trước đó và chưa có phiên. Không có → **phiên trái phép** (`userId = null`, `unauthorized = true`), báo quản lý trạm. Nếu `energyKwh` đầu tiên > 0.5 → lưu làm mốc (`energy_start_kwh`), chỉ tính phần tăng thêm, gắn `needsReview`.
4. `charging` và cổng đã có phiên → `energy_kwh = max(cũ, mới)`; tăng vượt `22 kW × thời gian` → bỏ giá trị, gắn `needsReview`. Công suất ≤ 0.1 kW liên tục ≥ 5 phút → bắt đầu đếm phí chiếm chỗ (`idle_since`), sau 15 phút ân hạn tính 1.000đ/phút, trần 100.000đ.
5. `idle`/`fault` và có phiên mở → đóng phiên: `energy_kwh = max(cũ, payload)`, `cost = energyCost + idleFee`, trừ cọc, ghi `end_reason`. `fault` không tính phí chiếm chỗ và mở `incident`.
6. Sau mỗi bước, phát sự kiện WebSocket (mục 1b).

**Mock khi chưa có ESP32 thật:** `mosquitto_pub` với tài khoản MQTT của trạm (lệnh mẫu ở `mosquitto/README.md`), hoặc `npm run e2e:demo` trong `backend/`.

---

## 1b. WebSocket — đẩy trạng thái real-time (Backend → Frontend)

Đường dẫn: `ws://<host>/ws`. Không theo envelope mục 2. Mỗi message có dạng `{ "event": "...", "payload": { ... } }`.

**Kênh công khai** (không cần token):

| Event | Payload | Khi nào phát |
|---|---|---|
| `port:update` | `{ stationId, portId, status, powerKw, online, recordedAt }` | Mỗi khi backend nhận bản tin MQTT của cổng, hoặc watchdog đánh cổng offline. `stationId` là mã trạm, `portId` là `ports.id` |

**Kênh có xác thực:** sau khi kết nối, client gửi `{ "type": "auth", "token": "<accessToken>" }`. Server trả `{ "event": "auth:ok", "payload": { "userId", "role" } }` hoặc đóng kết nối nếu token sai.

| Event | Payload | Ai nhận |
|---|---|---|
| `session:update` | object `ChargingSession` (mục 3) | Tài xế sở hữu phiên, quản lý của trạm, admin |
| `alert` | `{ type, stationId, portId, sessionId?, message }` — `type` ∈ `unauthorized_session` \| `vehicle_full` \| `idle_fee_started` \| `port_offline` \| `port_fault` | Quản lý của trạm + admin; `vehicle_full`/`idle_fee_started` gửi thêm cho tài xế của phiên |

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

`error.details` (tuỳ chọn) — dữ liệu kèm theo để client xử lý tiếp, hiện chỉ dùng ở check-in (xem mục 4).

### Danh sách `error.code` chuẩn (không tự đặt code mới ngoài danh sách, muốn thêm phải báo nhóm)

| Code | HTTP status | Khi nào dùng |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Body/query không đúng định dạng hoặc vi phạm luật thời gian (thời lượng, giờ phục vụ...) |
| `UNAUTHORIZED` | 401 | Thiếu token, token sai/hết hạn, hoặc tài khoản đã bị khoá/xoá |
| `FORBIDDEN` | 403 | Có token nhưng không đủ quyền (RBAC) hoặc không sở hữu tài nguyên (chống IDOR) |
| `ACCOUNT_DISABLED` | 403 | Đăng nhập đúng mật khẩu nhưng tài khoản đã bị admin khoá |
| `NOT_FOUND` | 404 | ID không tồn tại (generic) |
| `STATION_NOT_FOUND` | 404 | Riêng cho `/stations/:id` |
| `PAYMENT_NOT_FOUND` | 404 | Riêng cho `/payments/:id` |
| `EMAIL_ALREADY_EXISTS` | 409 | Đăng ký hoặc đổi email trùng với tài khoản khác |
| `STATION_CODE_ALREADY_EXISTS` | 409 | `POST /stations` với `code` đã tồn tại |
| `STATION_NOT_OPERATIONAL` | 409 | Đặt chỗ ở trạm đã ngừng hoạt động hoặc chưa có quản lý |
| `STATION_IN_USE` | 409 | Ngừng hoạt động trạm khi còn phiên đang mở hoặc booking sắp tới |
| `OWNER_HAS_STATIONS` | 409 | Khoá tài khoản quản lý đang được phân công trạm |
| `PORT_UNAVAILABLE` | 409 | Đặt chỗ vào cổng đang bảo trì, hoặc cổng đang `fault`/offline mà booking bắt đầu trong vòng 1 giờ |
| `BOOKING_CONFLICT` | 409 | Trùng khung giờ với booking khác cùng cổng, hoặc tài xế đã có booking khác chồng giờ |
| `BOOKING_LIMIT_REACHED` | 409 | Vượt giới hạn: >1 booking chờ cọc, >2 booking đã cọc, hoặc ≥3 lần giữ chỗ hết hạn trong 24h |
| `UNPAID_SESSION_EXISTS` | 409 | Đặt chỗ khi còn phiên sạc chưa trả phần còn lại |
| `BOOKING_CANCEL_NOT_ALLOWED` | 400 | Huỷ booking đã kết thúc/đã huỷ, đã check-in, hoặc tài xế huỷ khi đã quá giờ bắt đầu |
| `CHECKIN_NOT_ALLOWED` | 400 | Check-in ngoài cửa sổ thời gian hoặc booking sai trạng thái |
| `INVALID_CHECKIN_CODE` | 400 | Sai mã check-in |
| `SESSION_ACTION_NOT_ALLOWED` | 409 | Thao tác lên phiên không hợp lệ ở trạng thái hiện tại (phiên đã đóng/đã có chủ, chưa offline, số kWh ngoài giới hạn...) |
| `PAYMENT_IN_PROGRESS` | 409 | Tạo thanh toán khi đã có giao dịch `pending` chưa hết hạn |
| `PAYMENT_ALREADY_PROCESSED` | 409 | Phiên đã thanh toán đủ; hoặc thao tác hoàn tiền lên giao dịch không ở trạng thái cần hoàn |
| `INVALID_SIGNATURE` | 400 | Chữ ký VNPay không khớp |
| `TOO_MANY_REQUESTS` | 429 | Vượt giới hạn tần suất (`/auth/login`, `/auth/register`, check-in) hoặc mã check-in đang bị khoá do sai nhiều lần |
| `DB_UNAVAILABLE` | 500 | Riêng cho `/health`: không kết nối được DB (không trả chi tiết lỗi) |
| `INTERNAL_ERROR` | 500 | Lỗi server không xác định |

---

## 3. Object chuẩn (JSON trả về từ API — đã map sang camelCase)

### User

```json
{ "id": 1, "name": "Nguyễn Văn A", "email": "a@example.com", "role": "driver", "isActive": true }
```

`role` ∈ `driver` \| `owner` \| `admin`. **Không bao giờ** trả `passwordHash` ra API.

### Station

```json
{
  "id": 1,
  "name": "Trạm Cầu Giấy",
  "ownerId": 2,
  "isActive": true,
  "location": { "lat": 21.0368, "lng": 105.7829 },
  "ports": [Port],
  "createdAt": "2026-10-01T00:00:00Z"
}
```

`location` map từ cột `geom` (PostGIS) qua `ST_X`/`ST_Y`. `ownerId` = quản lý được admin phân công, có thể `null`. Cột `code` (mã IoT) **không trả ra API**.

### Port

```json
{
  "id": 10, "stationId": 1, "portNumber": 1,
  "status": "charging", "serviceStatus": "in_service",
  "online": true, "lastSeenAt": "2026-11-18T08:00:00Z"
}
```

- `status` ∈ `idle` \| `charging` \| `fault` — trạng thái thiết bị báo lên.
- `serviceStatus` ∈ `in_service` \| `maintenance` — do quản lý trạm đặt.
- `online` = có bản tin trong 60 giây gần nhất (cổng chưa từng gửi → `false`).

### Booking

```json
{
  "id": 5, "userId": 1, "portId": 10,
  "startTime": "2026-11-19T08:00:00Z", "endTime": "2026-11-19T09:00:00Z",
  "status": "confirmed",
  "holdExpiresAt": "2026-11-18T08:05:00Z",
  "depositAmount": 20000,
  "depositPaymentId": 31,
  "checkInCode": "482913",
  "checkedInAt": null,
  "cancelReason": null,
  "createdAt": "2026-11-18T08:00:00Z"
}
```

- `status` ∈ `pending` (chờ cọc) \| `confirmed` (đã cọc) \| `checked_in` \| `completed` \| `cancelled` \| `no_show`.
- `checkInCode` **chỉ trả cho chính tài xế** của booking (ở `GET /bookings/me`, khi `confirmed`/`checked_in`/`completed`); mọi chỗ khác là `null`.
- Ở `GET /stations/:id/bookings` có thêm `driverName`.

### ChargingSession

```json
{
  "id": 7, "bookingId": 5, "userId": 1, "portId": 10,
  "startedAt": "2026-11-19T08:02:00Z", "endedAt": "2026-11-19T08:55:00Z",
  "energyKwh": 11.2, "energyCost": 39200,
  "idleMinutes": 10, "idleFee": 10000,
  "cost": 49200,
  "depositApplied": 20000, "amountDue": 29200,
  "paymentStatus": "unpaid",
  "unauthorized": false, "needsReview": false,
  "endReason": "device_idle"
}
```

- `energyKwh` = điện năng tính tiền của phiên. `cost` = `energyCost + idleFee` (tổng tiền phiên).
- `bookingId`/`userId` = `null` khi phiên trái phép (`unauthorized = true`).
- `endedAt`, `cost`, `amountDue`, `paymentStatus`, `endReason` = `null` khi phiên đang chạy.
- `paymentStatus` ∈ `not_required` \| `unpaid` \| `paid` (`paid` gồm trường hợp cọc đã phủ đủ); `null` với phiên trái phép.
- `endReason` ∈ `device_idle` \| `device_fault` \| `manual_close`.

### Payment

```json
{
  "id": 1, "purpose": "session", "bookingId": 5, "chargingSessionId": 7,
  "amount": 29200, "status": "success", "refundStatus": null,
  "vnpayTxnRef": "SACDAU17918230000", "vnpayTransactionNo": "14231456",
  "paidAt": "2026-11-19T09:00:00Z", "createdAt": "2026-11-19T08:58:00Z"
}
```

- `purpose` ∈ `booking_deposit` \| `session`. `status` ∈ `pending` \| `success` \| `failed`.
- `refundStatus` ∈ `null` \| `due` (cần hoàn) \| `refunded`.

### Incident

```json
{
  "id": 3, "portId": 10, "stationId": 1, "type": "offline",
  "openedAt": "...", "recoveredAt": "...", "resolvedAt": null, "resolvedBy": null, "note": null
}
```

`type` ∈ `fault` \| `offline`. `recoveredAt` = lúc thiết bị báo bình thường trở lại; `resolvedAt` = lúc quản lý đóng sự cố.

---

## 4. Danh sách endpoint

### Tài khoản — `/auth`, `/users`

| Method | Path | Body | `data` trả về |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password }` — luôn tạo `driver` (field `role` nếu gửi chỉ chấp nhận `"driver"`) | `{ user, accessToken, refreshToken }` |
| POST | `/auth/login` | `{ email, password }` | `{ user, accessToken, refreshToken }` |
| POST | `/auth/refresh` | `{ refreshToken }` | `{ accessToken }` |
| GET | `/users/me` | — | `User` |
| GET | `/users` *(admin)* | — | `User[]` |
| POST | `/users` *(admin)* | `{ name, email, password, role }` — `role` ∈ `driver`/`owner` | `User` |
| PATCH | `/users/:id` *(chính chủ hoặc admin)* | `{ name?, email? }` | `User` |
| PATCH | `/users/:id/status` *(admin)* | `{ isActive }` | `User` |

Access token 15 phút, refresh token 7 ngày. Mỗi request có token, backend đọc lại `is_active` và `role` từ DB.

### Trạm & cổng — `/stations`, `/ports`

| Method | Path | Body/Query | `data` trả về |
|---|---|---|---|
| GET | `/stations` | `?near=lat,lng&radiusKm=` (tuỳ chọn) — public, chỉ trạm active | `Station[]` |
| GET | `/stations/managed` *(owner/admin)* | — owner: trạm được phân công; admin: tất cả (kể cả ngừng hoạt động) | `Station[]` |
| GET | `/stations/:id` | public — trạm đã ngừng hoạt động trả `404 STATION_NOT_FOUND` (admin xem qua `/stations/managed`) | `Station` |
| POST | `/stations` *(admin)* | `{ name, code, lat, lng, portsCount? }` | `Station` |
| PATCH | `/stations/:id` *(admin)* | `{ name?, lat?, lng? }` | `Station` |
| DELETE | `/stations/:id` *(admin)* | — ngừng hoạt động (soft), `409 STATION_IN_USE` nếu còn phiên mở/booking sắp tới | `Station` |
| PATCH | `/stations/:id/assign-owner` *(admin)* | `{ ownerId }` — tài khoản `owner` đang active | `Station` |
| PATCH | `/ports/:id/service` *(owner của trạm/admin)* | `{ serviceStatus, reason? }` | `{ port: Port, affectedBookings: Booking[] }` |
| GET | `/stations/:id/bookings` *(owner của trạm/admin)* | `?date=YYYY-MM-DD` (mặc định hôm nay, giờ VN) | `Booking[]` (kèm `driverName`, không có `checkInCode`) |
| GET | `/stations/:id/sessions` *(owner của trạm/admin)* | — | `ChargingSession[]` |

### Đặt chỗ — `/bookings`

| Method | Path | Body | `data` trả về |
|---|---|---|---|
| POST | `/bookings` *(driver)* | `{ portId, startTime, endTime }` | `Booking` + `paymentUrl` (link VNPay trả cọc) |
| GET | `/bookings/me` | — | `Booking[]` |
| PATCH | `/bookings/:id/cancel` *(tài xế của booking / owner của trạm / admin)* | `{ reason? }` | `Booking` |
| POST | `/bookings/:id/check-in` *(owner của trạm/admin)* | `{ code, portId?, attachSessionId? }` | `{ booking: Booking, session: ChargingSession \| null }` |

**Luật `POST /bookings`** (đầy đủ ở `LUONG_NGHIEP_VU.md` mục 4): còn nợ → `UNPAID_SESSION_EXISTS`; vượt giới hạn → `BOOKING_LIMIT_REACHED`; thời lượng 15 phút – 4 giờ, bắt đầu từ bây giờ tới 7 ngày, trong giờ phục vụ 6h–22h → sai thì `VALIDATION_ERROR`; trạm không hoạt động/chưa có quản lý → `STATION_NOT_OPERATIONAL`; cổng bảo trì, hoặc `fault`/offline với booking bắt đầu trong 1 giờ → `PORT_UNAVAILABLE`; trùng giờ cùng cổng hoặc tài xế tự chồng giờ → `BOOKING_CONFLICT`. Hợp lệ → `pending`, giữ chỗ 5 phút chờ IPN cọc → `confirmed`.

**Luật huỷ:** tài xế huỷ `pending` (bất cứ lúc nào) hoặc `confirmed` trước giờ bắt đầu; huỷ `confirmed` trước ≥ 2 giờ → cọc cần hoàn, sát giờ hơn → mất cọc. Owner/admin huỷ `pending`/`confirmed` bất cứ lúc nào → cọc cần hoàn. `checked_in`/`completed`/`cancelled`/`no_show` → `BOOKING_CANCEL_NOT_ALLOWED`.

**Luật check-in:** booking `confirmed`, trong cửa sổ `[startTime − 15 phút, startTime + 15 phút]`; hoặc check-in lại để gắn phiên (`attachSessionId` bắt buộc) khi booking `checked_in`/`completed` và chưa quá `endTime`. Sai mã → `INVALID_CHECKIN_CODE`; sai 5 lần → khoá 10 phút (`TOO_MANY_REQUESTS`). `portId` → chuyển sang cổng khác cùng trạm (cổng phải trống cả khung giờ, không bảo trì). Nếu cổng đang có phiên mở chưa gắn ai mà không gửi `attachSessionId` → `409 SESSION_ACTION_NOT_ALLOWED` với `error.details = { session: ChargingSession }` để quản lý xác nhận và gửi lại kèm `attachSessionId`.

### Phiên sạc — `/sessions`

| Method | Path | Body | `data` trả về |
|---|---|---|---|
| GET | `/sessions/me` | — | `ChargingSession[]` của chính mình |
| GET | `/sessions/:id` *(chủ phiên / owner của trạm / admin)* | — | `ChargingSession` |
| POST | `/sessions/:id/force-close` *(owner của trạm/admin)* | `{ energyKwh, note }` | `ChargingSession` |

`force-close` chỉ khi phiên đang mở và (cổng offline hoặc phiên `needsReview`); `energyKwh` phải nằm trong `[số đo cuối, số đo cuối + 22 kW × thời gian mất tín hiệu]`; sai → `SESSION_ACTION_NOT_ALLOWED`.

### Thanh toán — `/payments` (VNPay sandbox)

| Method | Path | Body | `data` trả về |
|---|---|---|---|
| POST | `/payments` *(chủ phiên)* | `{ chargingSessionId }` | `{ paymentId, paymentUrl }` |
| GET | `/payments/:id` *(người trả / admin)* | — | `Payment` |
| GET | `/payments/:id/checkout` *(người trả)* | — | `{ paymentUrl }` — dựng lại đúng link cũ khi còn `pending` và chưa hết hạn |
| GET | `/payments/refunds` *(admin)* | `?status=due\|refunded` (mặc định `due`) | `Payment[]` |
| POST | `/payments/:id/mark-refunded` *(admin)* | `{ note? }` | `Payment` |

**Điều kiện `POST /payments`:** phiên đã đóng, `userId` là người gọi, `amountDue > 0`, chưa có giao dịch `session` thành công; đang có giao dịch `pending` chưa hết hạn → `PAYMENT_IN_PROGRESS`; đã trả đủ → `PAYMENT_ALREADY_PROCESSED`. Số tiền = `amountDue`. Giao dịch hết hạn sau 15 phút (cọc: 5 phút).

**3 route đặc biệt — KHÔNG theo envelope chuẩn** (định dạng do VNPay quy định):

- `GET /payments/vnpay-return` — VNPay redirect **trình duyệt** về đây. Backend verify chữ ký rồi **redirect** về frontend (`/payment-result?status=success|failed&txnRef=...`). **Không cập nhật DB** ở route này (người dùng có thể sửa URL).
- `GET /payments/vnpay-ipn` — VNPay **server** gọi ngầm bằng **GET** để xác nhận giao dịch thật (cả cọc và phiên). Backend verify chữ ký, **so số tiền** với giao dịch đã lưu, rồi trả đúng format VNPay: `{ "RspCode": "00", "Message": "Confirm Success" }`. Mã lỗi: `97` sai chữ ký, `01` không thấy giao dịch, `04` sai số tiền, `02` đã xử lý. Giao dịch thành công nhưng đã có giao dịch thành công khác cho cùng phiên/booking, hoặc cọc của booking đã bị huỷ → vẫn ghi nhận `success`, đặt `refundStatus = "due"`, trả `00`.

**Biến môi trường** (`backend/.env.example`): `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_URL`, `VNPAY_RETURN_URL`. IPN URL khai trên cổng merchant VNPay (khi demo dùng tunnel, xem `README.md` mục "Demo VNPay thật").

### Sự cố — `/incidents`

| Method | Path | Body/Query | `data` trả về |
|---|---|---|---|
| GET | `/incidents` *(owner/admin)* | `?status=open\|resolved` (mặc định `open`) — owner chỉ thấy trạm mình | `Incident[]` |
| PATCH | `/incidents/:id/resolve` *(owner của trạm/admin)* | `{ note }` | `Incident` |

### Báo cáo — `/reports` (admin: toàn hệ thống; owner: trạm được phân công)

| Method | Path | `data` trả về |
|---|---|---|
| GET | `/reports/revenue?from=&to=` | `{ totalRevenue, totalSessions, byStation: [{ stationId, revenue }], collectedRevenue, idleFees, forfeitedDeposits, refundsDue, outstandingRevenue, unauthorized: { sessions, energyKwh, amount } }` |
| GET | `/reports/usage?from=&to=` | `{ byHour: [{ hour, count }], byStation: [{ stationId, count }] }` |

`from`/`to` tuỳ chọn, nhận ISO 8601 hoặc `YYYY-MM-DD`. Dạng `YYYY-MM-DD` tính trọn ngày theo giờ Việt Nam: `from` từ 00:00, `to` tới hết 23:59:59 của ngày đó.

`totalRevenue` = tổng `cost` của phiên có chủ đã đóng; `collectedRevenue` = tiền VNPay đã thu (không tính khoản cần hoàn); `forfeitedDeposits` = cọc mất do no-show/huỷ sát giờ; `refundsDue` = tổng đang cần hoàn; `outstandingRevenue` = tổng `amountDue` chưa trả; `unauthorized` = thất thoát do phiên trái phép.

---

## 5. Quy tắc thay đổi contract

- Field/endpoint nào đã chốt ở đây mà cần đổi tên, đổi kiểu, hoặc xoá → **báo nhóm trước**, sửa file này trước, rồi cả 3 người cùng sửa code theo.
- Thêm **field mới** (không đổi field cũ) không cần họp — chỉ cần thêm vào đây rồi báo nhóm 1 câu trong chat.
- Mọi route backend viết ra **phải** đúng response envelope ở mục 2 — xem `backend/src/routes/health.js` làm mẫu.
