# Luồng nghiệp vụ — SacDau

File này là **đặc tả luồng nghiệp vụ đã chốt** (2026-11-18): ai làm gì, theo thứ tự nào, hệ thống chặn những kịch bản xấu nào và bằng cách nào. Field/endpoint/error code chính xác nằm ở `docs/contracts.md`; phạm vi tính năng ở `docs/FEATURES.md`. Muốn đổi luồng nào ở đây → báo nhóm, sửa file này trước rồi mới sửa code.

---

## 0. Bối cảnh: vì sao cần quản lý trạm

Mạch ESP32 **chỉ gửi dữ liệu 1 chiều lên server** (MQTT), server không gửi lệnh ngược xuống. Hệ quả:

| Server không làm được | Rủi ro nếu bỏ mặc | Cách bù trong hệ thống |
|---|---|---|
| Khoá/mở cổng theo booking | Người chưa đặt cắm súng; người khác cắm vào cổng đã đặt → người đặt bị tính tiền | Quản lý trạm chỉ cho người đã **check-in bằng mã** cắm súng; phiên không check-in = **phiên trái phép**, báo quản lý ngay |
| Ngắt sạc khi hết tiền | Sạc xong bỏ đi không trả | **Cọc trước** qua VNPay; phần còn lại thành nợ trên tài khoản, chặn đặt chỗ mới tới khi trả |
| Dừng sạc theo yêu cầu tài xế | Tài xế muốn dừng qua app | Không hỗ trợ — rút súng tại trạm hoặc gọi quản lý |
| Reset lỗi `fault` từ xa | Cổng lỗi vẫn nhận đặt | Tự mở `incident`; cổng bảo trì không nhận đặt; quản lý huỷ/đổi cổng cho booking bị ảnh hưởng |
| Hỏi trạng thái thiết bị | Mất WiFi/điện → phiên mở mãi | Watchdog theo giờ server → `offline`, phiên `needsReview`, quản lý đóng tay (có chặn trên/dưới) |
| Đồng bộ cấu hình xuống mạch | Số cổng trong DB lệch với mạch | Admin khai `code` + số cổng khớp mạch; bản tin của cổng lạ bị bỏ + ghi log |
| Đồng bộ giờ | NTP lỗi → timestamp 1970, đồng hồ lệch | Mọi trạng thái dùng **giờ server**; giờ thiết bị chỉ lưu vào `telemetry.recorded_at` |

**Ý nghĩa trạng thái thiết bị** (bắt buộc với IoT): `charging` = **súng đang cắm** (kể cả khi pin đầy, `powerKw ≈ 0`); `idle` = **đã rút súng** (gửi trong ≤ 5 giây sau khi rút); `fault` = lỗi thiết bị. Trên Wokwi: nút bấm = cắm/rút súng, biến trở = công suất (vặn về 0 = pin đầy).

## 1. Nguyên tắc

| Nguồn sự thật | Quyết định |
|---|---|
| **Thiết bị** | Trạng thái vật lý cổng, điện năng, công suất, nhiệt độ. Server không tự sửa số liệu thiết bị. |
| **Server** | Quyền (RBAC), booking, phiên thuộc về ai, giá, cọc, phí chiếm chỗ, thanh toán, hoàn tiền. |
| **Quản lý trạm** (`owner`) | Kiểm soát vật lý (chỉ người đã check-in được cắm), xác nhận những gì thiết bị không biết. **Không thu/chi tiền** — mọi khoản tiền đi qua VNPay. |

Hai quy tắc vàng:
1. **Không đủ bằng chứng thì không gán tiền cho tài xế.** Không đoán theo khung giờ; phiên không gắn được ai là phiên trái phép.
2. **Gán tiền cho ai thì người đó phải đồng ý bằng mã.** Mã check-in nằm trên app tài xế; tài xế đưa mã cho quản lý nhập. Mã có giới hạn số lần thử.

Mọi khách hàng **bắt buộc có tài khoản** — không có khách vãng lai.

---

## 2. Tài khoản & vai trò

- **Tài xế** (`driver`) tự đăng ký trên web.
- **Quản lý trạm** (`owner`) là nhân viên công ty, **không tự đăng ký** — admin tạo bằng `POST /users`.
- **Admin** tạo bằng script `npm run create-admin` (không qua API).
- Admin khoá/mở tài khoản (`PATCH /users/:id/status`). Mỗi request có token, backend đọc lại `is_active` và `role` từ DB → khoá hoặc đổi quyền có hiệu lực ngay, không phải chờ token hết hạn. Đăng nhập tài khoản đã khoá (đúng mật khẩu) → `403 ACCOUNT_DISABLED`.
- Không khoá được quản lý đang phụ trách trạm (`409 OWNER_HAS_STATIONS`) — phải chuyển trạm cho người khác trước, để trạm không "mồ côi".

## 3. Trạm & cổng

- Admin tạo trạm (`code` khớp mã trong mạch, số cổng khớp mạch) và phân công quản lý.
- **Trạm chỉ nhận đặt chỗ khi đang hoạt động và đã có quản lý** (`409 STATION_NOT_OPERATIONAL`) — không có người trực thì không ai check-in được.
- **Giờ phục vụ** 6h–22h (giờ Việt Nam, cấu hình trong `backend/src/config/rules.js`): booking phải nằm trọn trong khung này. Ngoài giờ trạm đóng cửa; phiên phát sinh ngoài giờ là phiên trái phép.
- Xoá trạm = **ngừng hoạt động** (không xoá cứng, giữ lịch sử tài chính). Từ chối nếu còn phiên đang sạc hoặc booking sắp tới (`409 STATION_IN_USE`).
- Dữ liệu gốc (tên, toạ độ, mã, số cổng) **chỉ admin sửa**. Quản lý chỉ bật/tắt bảo trì cổng (`PATCH /ports/:id/service`); API trả về danh sách booking bị ảnh hưởng để quản lý huỷ (hoàn cọc) hoặc đổi cổng lúc check-in.

## 4. Đặt chỗ và cọc

```
Tài xế ──POST /bookings──► Backend: kiểm tra luật ─► booking "pending" (giữ chỗ 5 phút) + link VNPay cọc
Tài xế ──trả cọc trên VNPay──► VNPay ──IPN──► Backend: booking "confirmed" + sinh mã check-in 6 số
Không trả trong 5 phút ──► job: booking "cancelled" (payment_timeout), nhả slot
```

Luật khi đặt (kiểm tra theo thứ tự, trong 1 transaction có khoá dòng tài xế):

1. Còn phiên sạc chưa trả phần còn lại → `409 UNPAID_SESSION_EXISTS`.
2. Tối đa **1 booking đang chờ cọc** và **2 booking đã cọc**; ≥ 3 lần giữ chỗ hết hạn không trả trong 24 giờ → `409 BOOKING_LIMIT_REACHED` (chặn spam giữ chỗ để khoá cổng).
3. Thời lượng 15 phút – 4 giờ, bắt đầu từ bây giờ tới tối đa 7 ngày, nằm trong giờ phục vụ → sai thì `400 VALIDATION_ERROR`.
4. Trạm hoạt động + có quản lý → `409 STATION_NOT_OPERATIONAL`. Cổng đang bảo trì → `409 PORT_UNAVAILABLE`. Cổng đang `fault`/offline **chỉ bị chặn khi booking bắt đầu trong vòng 1 giờ tới** (mất WiFi 1 phút không làm hỏng việc đặt cho ngày mai).
5. Trùng giờ cùng cổng, hoặc chính tài xế đã có booking khác chồng giờ ở bất kỳ cổng nào → `409 BOOKING_CONFLICT`. Kiểm tra bằng **exclusion constraint** của PostgreSQL, nên 2 request gửi cùng lúc cũng chỉ 1 cái thành công.

Sau khi đặt:

- Lỡ đóng tab VNPay khi còn trong hạn → `GET /payments/:id/checkout` trả lại **đúng link cũ** (không phải đặt lại, không tạo giao dịch thứ 2).
- `cancelled` là trạng thái cuối: nếu VNPay báo đã trả **sau khi** booking đã huỷ → khoản cọc vào diện **cần hoàn**, không khôi phục booking.
- **Đặt ngay tại trạm**: khách tới trạm mà chưa đặt → đăng nhập app, đặt booking bắt đầu từ bây giờ, trả cọc, quản lý check-in ngay. Không có luồng riêng.

### Huỷ và hoàn cọc

| Tình huống | Cọc |
|---|---|
| Tài xế huỷ khi booking còn `pending` | Chưa trả → không có gì |
| Tài xế huỷ `confirmed` trước giờ bắt đầu **≥ 2 giờ** | Cần hoàn |
| Tài xế huỷ sát giờ (< 2 giờ) hoặc không đến (`no_show`) | Mất cọc (phí giữ chỗ) |
| Quản lý/admin huỷ (cổng hỏng, bảo trì, xe khác chiếm, trạm đóng…) | Cần hoàn |
| Booking đã `checked_in` | Không huỷ được |

"Cần hoàn" = hệ thống ghi khoản phải trả lại; admin hoàn tiền rồi bấm xác nhận `POST /payments/:id/mark-refunded` (có audit log).

## 5. Check-in và gán phiên sạc

```
Tài xế tới trạm, mở app lấy mã check-in ──► đưa mã cho quản lý
Quản lý ──POST /bookings/:id/check-in { code }──► booking "checked_in"
Tài xế cắm súng ──► mạch gửi "charging" ──► phiên mở trong 15 phút sau check-in được gán cho booking
```

1. Quản lý xem danh sách booking hôm nay của trạm (`GET /stations/:id/bookings`, có tên tài xế, **không** có mã).
2. Check-in chỉ hợp lệ trong cửa sổ **15 phút trước tới 15 phút sau** giờ bắt đầu.
3. **Chống dò mã**: sai 5 lần → khoá check-in booking đó 10 phút (`429 TOO_MANY_REQUESTS`). Mã chỉ nằm trên điện thoại tài xế, nên quản lý không tự "bịa" check-in để đổ tiền phiên khác cho tài xế được.
4. Cổng đã đặt bị hỏng/bị chiếm → check-in kèm `portId` để **chuyển sang cổng trống khác cùng trạm**.
5. Cổng đang có phiên chưa gắn ai (tài xế cắm trước khi quản lý bấm) → API **không tự gán**, trả về phiên đó; quản lý xác nhận trước mặt tài xế bằng cách gửi lại kèm `attachSessionId`.
6. Chỉ **tự gán phiên mở trong vòng 15 phút sau check-in**. Quá 15 phút → phiên mới là phiên trái phép.
7. **Rút ra cắm lại / cắm trễ**: tài xế đưa lại mã, quản lý check-in lại kèm `attachSessionId` (cho phép tới hết giờ kết thúc booking).
8. Job tự động: booking `confirmed` quá giờ bắt đầu + 15 phút chưa check-in → `no_show` (mất cọc); booking `checked_in` hết giờ mà không có phiên nào → `completed` (cọc là phí tối thiểu).

## 6. Phiên trái phép

Phiên mở trên cổng mà không gắn được booking nào (không check-in, quá 15 phút sau check-in, ngoài giờ phục vụ…):

- Không gán cho ai, **không ai bị tính nợ**.
- Gửi cảnh báo ngay cho quản lý trạm ("cổng X có người cắm chưa check-in") → quản lý ra xử lý: yêu cầu khách đặt ngay + check-in (rồi gắn phiên bằng `attachSessionId`), hoặc rút súng.
- Vẫn tính điện năng/tiền để báo cáo **thất thoát do phiên trái phép theo từng trạm** — chỉ số đánh giá trách nhiệm quản lý trạm.

## 7. Trong lúc sạc và khi khách rời đi

| Tình huống | Server thấy gì | Xử lý |
|---|---|---|
| Cắm xe rồi đi chỗ khác, xe vẫn sạc | `charging`, `powerKw > 0` | Bình thường; tài xế theo dõi real-time trên app |
| Xe đầy pin, khách chưa quay lại | `charging`, `powerKw ≤ 0.1` liên tục ≥ 5 phút | Báo tài xế + quản lý. Sau **15 phút ân hạn** tính **phí chiếm chỗ** 1.000đ/phút (trần 100.000đ). Xe sạc tiếp thì dừng tính |
| Xe chiếm cổng, booking sau tới giờ | như trên | Quản lý check-in booking sau với `portId` cổng khác; hết cổng → huỷ booking đó (hoàn cọc); hoặc ra rút súng |
| Rút súng đi luôn, chưa trả phần còn lại | `idle` → phiên đóng | Số tiền còn lại thành **nợ trên tài khoản**, chặn đặt mới tới khi trả qua app |
| Check-in xong bỏ đi, không cắm | Không có phiên | Hết giờ booking → `completed`, cọc là phí tối thiểu |
| Phiên dừng vì thiết bị báo `fault` | `fault` | Đóng phiên, không tính phí chiếm chỗ, mở `incident` |

## 8. Xử lý bản tin từ thiết bị (backend)

1. Kiểm tra payload bằng schema; `stationId` trong payload phải khớp mã trạm trên topic; cổng lạ → bỏ + ghi log.
2. `recorded_at` lấy giờ thiết bị nếu lệch ≤ 5 phút so với server, ngược lại lấy giờ server. `last_seen_at` của cổng luôn là giờ server lúc nhận.
3. Xử lý **tuần tự theo từng cổng**; DB có ràng buộc "mỗi cổng tối đa 1 phiên đang mở".
4. `charging` khi chưa có phiên → mở phiên (chụp đơn giá tại thời điểm mở). Nếu số `energyKwh` đầu tiên > 0.5 kWh (vd thiết bị online lại sau khi phiên đã bị đóng tay) → lấy làm mốc, chỉ tính phần tăng thêm, gắn `needsReview` — không tính tiền 2 lần.
5. `charging` khi đã có phiên → điện năng chỉ tăng (lấy giá trị lớn hơn); tăng vô lý (vượt công suất tối đa 22 kW × thời gian) → bỏ, gắn `needsReview`.
6. `idle`/`fault` → đóng phiên với điện năng lớn nhất đã ghi nhận (thiết bị khởi động lại gửi `energyKwh = 0` không làm mất tiền điện).
7. **Watchdog** (theo giờ server): cổng im lặng > 60 giây → `offline`, mở `incident`, phiên đang mở → `needsReview` (không tự đóng vì chưa biết chỉ số cuối). Bỏ qua 90 giây đầu sau khi backend khởi động/kết nối lại broker, và bỏ qua cổng chưa từng gửi bản tin.
8. **Đóng tay** (`POST /sessions/:id/force-close`): chỉ khi cổng offline hoặc phiên `needsReview`; số kWh nhập vào **không nhỏ hơn** số đo cuối cùng và **không lớn hơn** số đo cuối + 22 kW × thời gian mất tín hiệu; có audit log.

## 9. Quyết toán và thanh toán (chỉ VNPay)

- Tổng tiền phiên = tiền điện (kWh × đơn giá lúc mở phiên) + phí chiếm chỗ.
- Cọc trừ dần vào các phiên của booking theo thứ tự; số còn lại (`amountDue`) tài xế trả qua `POST /payments`. Tổng nhỏ hơn cọc → cọc là phí tối thiểu, không hoàn phần dư.
- Đang có giao dịch chưa hết hạn → `409 PAYMENT_IN_PROGRESS` (lấy lại link cũ qua `/checkout`) — chống mở 2 tab trả 2 lần.
- IPN của VNPay (cả cọc lẫn phiên): kiểm tra chữ ký **và số tiền** (sai số tiền → `RspCode 04`). Nếu VNPay xác nhận một giao dịch trùng (đã có giao dịch thành công khác) → vẫn ghi nhận, đánh dấu **cần hoàn**, trả `00` cho VNPay.

## 10. Sự cố, báo cáo, real-time

- `incident` (`fault`/`offline`) do hệ thống tự mở; quản lý xem và đóng kèm ghi chú.
- Báo cáo doanh thu/sử dụng: admin xem toàn hệ thống, quản lý xem trạm mình phụ trách. Có thêm: đã thu, phí chiếm chỗ, cọc bị mất, cần hoàn, còn nợ, thất thoát do phiên trái phép.
- WebSocket: kênh công khai chỉ phát trạng thái cổng; thông tin phiên và cảnh báo chỉ gửi cho đúng tài xế/quản lý/admin đã xác thực.

## 11. Sơ đồ trạng thái

```
Booking: pending ─IPN cọc─► confirmed ─check-in─► checked_in ─phiên đóng─► completed
           └─hết 5 phút / tài xế huỷ─► cancelled (trạng thái cuối)
         confirmed ─quá giờ + 15 phút─► no_show (mất cọc)
         confirmed ─huỷ ≥ 2h trước / quản lý-admin huỷ─► cancelled (cọc cần hoàn)
         confirmed ─huỷ < 2h─► cancelled (mất cọc)

Phiên:   mở (có chủ | trái phép) ─idle/fault─► đóng
         mở ─mất tín hiệu─► needsReview ─đóng tay─► đóng (manual_close)
         mở: công suất ≈ 0 ≥ 5 phút ─► idleSince ─+15 phút─► tính phí chiếm chỗ

Tiền phiên:  not_required | unpaid ─VNPay / cọc đủ─► paid
Hoàn tiền:   (không) | due ─admin xác nhận─► refunded
```

---

## 12. Giới hạn chấp nhận (biết nhưng không xử lý trong phạm vi đồ án)

- Phần mềm **không ngăn được** người khác cắm súng — chỉ phát hiện và báo; ngăn là việc của quản lý trạm.
- Hệ thống **không tự phát hiện lỗi phía trạm để hoàn cọc**. Cổng hỏng mà quản lý không chủ động huỷ booking thì tài xế vẫn bị tính no-show/phí tối thiểu; khiếu nại xử lý ngoài hệ thống.
- Không dừng sạc từ xa; không hoàn tiền tự động qua API VNPay (admin hoàn tay rồi xác nhận).

## 13. Chạy demo

- **IPN của VNPay**: VNPay không gọi được `localhost`. Khi demo cần mở tunnel (vd `cloudflared tunnel --url http://localhost:3000`), rồi khai URL `https://<tunnel>/payments/vnpay-ipn` ở mục cấu hình IPN trên cổng merchant sandbox. Không có tunnel thì tài xế trả cọc xong booking vẫn bị huỷ sau 5 phút (tiền sẽ vào diện cần hoàn khi IPN đến sau).
- **MQTT có xác thực**: Mosquitto local bật user/password + ACL theo trạm (username = mã trạm, xem `mosquitto/README.md`). Demo Wokwi: chạy **Wokwi trong VS Code** và cho mạch nối thẳng Mosquitto trên máy qua `host.wokwi.internal:1883` (gateway có sẵn trong extension) — giữ nguyên xác thực + ACL, không cần broker cloud (đã chạy thật 2026-11-19). Chỉ khi chạy trên wokwi.com mới cần broker cloud có TLS + đăng nhập (vd EMQX Cloud Serverless); HiveMQ Cloud Serverless free đã ngừng nhận đăng ký mới. Cấu hình mạch nằm ở `iot/secrets.h` (không commit, mẫu `iot/secrets.example.h`).

## 14. Checklist bàn giao

**IoT (Người 1) — `iot/sketch.ino`** *(đã sửa 2026-11-19, cần Người 1 xem lại)*
- [x] Đăng nhập broker bằng user/password của trạm; bật/tắt TLS bằng `MQTT_USE_TLS` (TLS: `WiFiClientSecure` cổng 8883, chưa kiểm tra chứng chỉ — `setInsecure()`, đủ cho demo).
- [x] Cấu hình bí mật tách ra `iot/secrets.h` (gitignore), mẫu `iot/secrets.example.h`.
- [x] Đã chạy thật mạch ↔ server (2026-11-19, Wokwi VS Code → `host.wokwi.internal` → Mosquitto): cắm khi chưa check-in → phiên trái phép; giữ nút 2s / quá nhiệt → `fault`, đóng phiên `device_fault`, mở incident; reset khi hết nóng → `idle`.
- [x] Publish **ngay khi đổi trạng thái** + heartbeat 5 giây; mất kết nối thì giữ lại, gửi ngay khi kết nối lại.
- [x] Chống dội nút bấm (30 ms) — tránh 1 lần bấm thành nhiều lần cắm/rút.
- [x] Giữ `charging` khi pin đầy (công suất 0), chỉ gửi `idle` khi rút súng.
- [x] Chưa đồng bộ được NTP thì gửi `timestamp: null`.
- [x] `energyKwh` chỉ tăng trong 1 phiên, về 0 khi bắt đầu phiên mới.
- [x] Mất WiFi/MQTT tự kết nối lại, không chặn vòng lặp (nút bấm vẫn hoạt động).
- [ ] (Tuỳ chọn) Thêm biến trở thứ 2 để giả lập riêng từng cổng đầy pin.

**Frontend**
- [ ] Tài xế: bản đồ trạm, chi tiết trạm, đặt chỗ/đặt ngay → chuyển VNPay + đếm ngược 5 phút, danh sách booking + mã check-in, phiên đang sạc real-time + cảnh báo phí chiếm chỗ, trả phần còn lại, trang `/payment-result`.
- [ ] Quản lý trạm: booking hôm nay + nhập mã check-in (đổi cổng, gắn phiên), cảnh báo (phiên trái phép, xe đầy, sự cố), đóng tay phiên, bảo trì cổng, danh sách sự cố.
- [ ] Admin: tạo/khoá tài khoản nhân viên, quản lý trạm + phân công, danh sách cần hoàn, báo cáo.

⚠️ Cần chốt **ai làm màn hình quản lý trạm** — thiếu màn hình này thì luồng check-in không demo được.
