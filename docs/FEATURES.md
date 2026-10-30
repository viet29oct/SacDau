# Danh sách tính năng đã chốt — SacDau

File này là **phạm vi cuối cùng**. Không thêm tính năng mới giữa đường trừ khi cả nhóm đồng ý và cập nhật lại file này trước. Mục tiêu: tránh vừa code vừa nghĩ thêm, dẫn tới trễ deadline.

---

## 1. Theo vai trò (đã chốt — [Bắt buộc] trừ khi ghi chú khác)

> **Mô hình vận hành (cập nhật 2026-10-29):** Hệ thống là **1 công ty vận hành nhiều trạm sạc** (không phải marketplace chủ trạm tự đăng ký). `admin` tạo trạm và phân công `owner` quản lý; `owner` là nhân viên công ty, không tự tạo trạm. Chi tiết luồng nghiệp vụ: xem `docs/contracts.md` mục 1/1b/4.

**Tài xế** (`driver`)
- Đăng ký / đăng nhập
- Tìm trạm trên bản đồ (public, không bắt đăng nhập), lọc theo trạng thái/khoảng cách (nearest neighbor, đường chim bay — không routing thật)
- Xem chi tiết trạm + trạng thái từng cổng (cập nhật real-time qua WebSocket)
- Đặt chỗ theo khung giờ dự kiến (xác nhận ngay, không qua bước duyệt), huỷ đặt chỗ trước giờ bắt đầu
- Theo dõi phiên sạc đang diễn ra (real-time)
- Lịch sử phiên sạc + chi phí
- **Thanh toán qua VNPay sandbox** sau khi phiên sạc kết thúc (phiên phải gắn với chính tài xế qua booking — phiên vãng lai không có booking thì không thanh toán qua hệ thống)

**Quản lý trạm** (`owner` — nhân viên công ty, do admin phân công, KHÔNG tự đăng ký trạm)
- Xem danh sách trạm được phân công (`stations.owner_id` = chính mình)
- Cập nhật thông tin vận hành trạm/cổng thuộc trạm được phân công
- Xem doanh thu, tỷ lệ sử dụng của các trạm được phân công

**Admin**
- Quản lý user, phân quyền (RBAC 3 vai trò)
- Tạo/sửa/xoá trạm sạc và cổng sạc, **phân công `owner` quản lý từng trạm** (gán `stations.owner_id`)
- Dashboard tổng (doanh thu, giờ cao điểm, khu vực) — phục vụ Power BI

**Hệ thống / IoT**
- ESP32 (hoặc mock) gửi telemetry qua MQTT (1 chiều thiết bị → server, server không điều khiển ngược) → backend tự suy ra phiên sạc từ chuỗi `status` (hỗ trợ cả phiên có đặt chỗ và phiên vãng lai `booking_id = null`)
- Mô phỏng trạng thái `fault` (quá nhiệt / mất kết nối)

---

## 2. Theo môn học (để báo cáo không sót yêu cầu)

| Môn | Tính năng/kỹ thuật minh chứng |
|---|---|
| IoT | ESP32/Wokwi → MQTT → backend; mô phỏng fault |
| Ngôn ngữ kịch bản | REST API đầy đủ (Express), WebSocket đẩy trạng thái port real-time lên bản đồ |
| Web an toàn | JWT/RBAC/validate/rate-limit; **case study**: cố ý để lỗi SQL Injection ở 1 endpoint thử nghiệm, chứng minh bằng `sqlmap`, vá bằng tham số hoá (before/after cho báo cáo); verify HMAC-SHA512 signature của VNPay IPN (chống giả mạo callback thanh toán — tình huống bảo mật thực tế, tốt cho báo cáo); chống dò email qua thời gian phản hồi ở `/auth/login` (timing-attack mitigation); chống IDOR cho mô hình `owner` được phân công (chỉ sửa/xem trạm có `owner_id` là mình) *(2 mục thêm 2026-10-29, mô hình nghiệp vụ mới)* |
| GIS | (1) Buffer vùng phục vụ mỗi trạm + tìm khoảng trống chưa phủ sóng; (2) Nearest neighbor tìm trạm gần nhất; (3) Đếm điểm trong vùng phục vụ (nếu có dữ liệu OSM) |
| Phân tích dữ liệu | K-Means phân cụm trạm theo mức sử dụng; Decision Tree hoặc Linear Regression dự đoán nhu cầu theo giờ; Apriori/FP-Growth (tối thiểu, 1 phân tích) trên tổ hợp khung giờ/khu vực; anomaly detection trên `telemetry` (nhiệt độ/công suất bất thường → ý tưởng bảo trì dự đoán) |

**Lưu ý khi viết báo cáo:** mỗi người tự lập 1 bảng "tính năng đã làm → mục yêu cầu cụ thể trong đề cương môn" trong phần báo cáo của mình, trỏ đúng vào code/kết quả — tránh bị hỏi "kỹ thuật X ở đâu" mà không chỉ ra được.

---

## 3. Thanh toán VNPay sandbox — chi tiết luồng

1. Phiên sạc kết thúc: `charging_sessions.ended_at IS NOT NULL` và `cost > 0` (`cost = energy_kwh * UNIT_PRICE_PER_KWH`, backend tự tính khi đóng phiên — xem `docs/contracts.md` mục 1). Chỉ phiên có gắn `booking_id` (xác định được tài xế) mới thanh toán được qua hệ thống; phiên vãng lai (`booking_id = null`) nằm ngoài phạm vi thanh toán online.
2. Tài xế vào lịch sử phiên sạc, bấm "Thanh toán" → gọi `POST /payments` → backend kiểm tra phiên thuộc đúng tài xế (qua `booking_id → bookings.user_id`) và **chưa có `payments` nào `status = success`** cho phiên này, rồi tạo record `payments` (status `pending`), trả `paymentUrl`.
3. Frontend redirect tài xế sang `paymentUrl` (trang VNPay sandbox).
4. Tài xế thao tác trên VNPay (sandbox, không mất tiền thật) → VNPay redirect về `GET /payments/vnpay-return` (cho người dùng thấy kết quả) **và** gọi ngầm `POST /payments/vnpay-ipn` (xác nhận thật, dùng cái này để update DB, không dùng `vnpay-return` để update DB vì route đó người dùng có thể tự sửa URL giả mạo).
5. Backend verify `vnp_SecureHash` ở cả 2 route bằng `VNPAY_HASH_SECRET` trước khi tin bất kỳ dữ liệu nào VNPay gửi về.

Chi tiết object/endpoint/error code: xem `docs/contracts.md` mục 3 và 4.

**Việc cần làm trước khi code phần này:** một người trong nhóm tự đăng ký tài khoản sandbox tại `sandbox.vnpayment.vn` để lấy `VNPAY_TMN_CODE` + `VNPAY_HASH_SECRET` — không ai làm giùm được việc đăng ký này.

---

## 4. Đã cắt khỏi phạm vi (ghi lại để không ai đề xuất lại giữa đường)

- Mô hình marketplace (chủ trạm tự đăng ký trạm độc lập) — đổi sang mô hình 1 công ty vận hành nhiều trạm, `admin` phân công `owner` quản lý *(quyết định lại 2026-10-29, xem mục 1 và `docs/contracts.md`)*.
- Routing thật tới trạm (OSRM/pgRouting) — quá nặng so với thời gian, dùng nearest-neighbor đường chim bay.
- Đánh giá/review trạm.
- Chatbot/FAQ.
- Ví điện tử giả lập riêng — đã thay bằng VNPay sandbox thật.
- Ứng dụng mobile/PWA, gói thành viên VIP, gợi ý trạm theo tuyến đường đang đi.

Muốn thêm lại bất kỳ mục nào ở trên: phải họp nhóm và cập nhật file này trước, không tự thêm vào code.
