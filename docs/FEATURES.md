# Phạm vi tính năng — SacDau

Phạm vi đã chốt. Không thêm tính năng giữa đường trừ khi cả nhóm đồng ý và sửa file này trước. Cách từng tính năng chạy (thứ tự bước, kịch bản xấu): `LUONG_NGHIEP_VU.md`. Field/endpoint: `contracts.md`. Làm tới đâu rồi: `ROADMAP.md`.

**Mô hình vận hành:** 1 công ty vận hành nhiều trạm; `admin` tạo trạm và phân công `owner` (nhân viên) quản lý. Mạch IoT chỉ gửi 1 chiều nên quản lý trạm là cầu nối người–thiết bị: chỉ cho người đã check-in bằng mã cắm súng. Mọi khách hàng phải có tài khoản, mọi khoản tiền qua VNPay.

---

## 1. Theo vai trò

**Tài xế** (`driver`, tự đăng ký)
- Tìm trạm trên bản đồ (public), lọc theo trạng thái / khoảng cách (đường chim bay)
- Xem trạng thái từng cổng real-time
- Đặt chỗ theo khung giờ (15 phút – 4 giờ, trong 6h–22h), **trả cọc VNPay ngay** (5 phút không trả → tự huỷ); tới trạm chưa đặt thì "đặt ngay"
- Huỷ đặt chỗ (trước ≥ 2 giờ được hoàn cọc)
- Nhận mã check-in 6 số, đưa cho quản lý trạm khi tới
- Theo dõi phiên sạc real-time, nhận cảnh báo xe đầy pin / bắt đầu tính phí chiếm chỗ
- Lịch sử phiên + chi phí; trả phần còn lại qua VNPay (còn nợ thì không đặt chỗ mới được)

**Quản lý trạm** (`owner`, admin tạo — không tự đăng ký)
- Xem trạm được phân công và booking hôm nay
- Check-in tài xế bằng mã; đổi cổng khi cổng đã đặt hỏng/bị chiếm; gắn phiên khi tài xế cắm trước/cắm lại
- Nhận cảnh báo: phiên trái phép, xe đầy pin chiếm cổng, cổng lỗi/mất kết nối
- Bật/tắt bảo trì cổng, huỷ booking bị ảnh hưởng (hoàn cọc)
- Đóng phiên thủ công khi thiết bị mất kết nối (có giới hạn kWh, ghi audit)
- Xem/đóng sự cố; xem doanh thu, tỷ lệ sử dụng các trạm mình quản lý
- Không thu/chi tiền mặt

**Admin**
- Tạo tài khoản quản lý trạm, khoá/mở tài khoản
- Tạo/sửa/ngừng hoạt động trạm và cổng, phân công quản lý
- Xử lý danh sách cọc/giao dịch **cần hoàn** (hoàn tay rồi xác nhận trên hệ thống)
- Báo cáo tổng: doanh thu, đã thu, còn nợ, cọc bị mất, thất thoát do phiên trái phép, giờ cao điểm

**Hệ thống / IoT**
- ESP32 gửi telemetry qua MQTT (broker có xác thực theo trạm) → backend tự suy ra phiên sạc; phiên chỉ gắn với tài xế qua check-in
- Phát hiện cổng mất kết nối (watchdog), lỗi `fault` (quá nhiệt) → tự mở sự cố
- Phát hiện xe đầy pin (công suất ≈ 0) để tính phí chiếm chỗ

## 2. Theo môn học

| Môn | Kỹ thuật minh chứng |
|---|---|
| IoT | ESP32/Wokwi → MQTT (user/password + ACL theo trạm) → backend; mô phỏng fault, phát hiện offline bằng heartbeat |
| Ngôn ngữ kịch bản | REST API (Express), WebSocket real-time, state machine booking/phiên sạc, job định kỳ (hết hạn cọc, no-show, watchdog) |
| Web an toàn | JWT/RBAC/validate/rate-limit; case study SQL Injection (1 endpoint thử nghiệm cố ý lỗi, chứng minh bằng `sqlmap`, vá bằng tham số hoá); verify HMAC + so số tiền ở VNPay IPN; chống dò email qua thời gian phản hồi; chống IDOR theo `owner`; chống dò mã check-in; chống race condition bằng exclusion constraint; thu hồi quyền tức thì khi khoá tài khoản; WebSocket có xác thực |
| GIS | Buffer vùng phục vụ + tìm khoảng trống phủ sóng; nearest neighbor; đếm điểm trong vùng phục vụ |

Khi viết báo cáo, mỗi người lập 1 bảng "kỹ thuật đã làm → mục yêu cầu trong đề cương môn", trỏ đúng vào code/kết quả.

## 3. Đã cắt khỏi phạm vi

Ghi lại để không ai đề xuất lại giữa đường. Muốn thêm lại → họp nhóm, sửa file này trước.

- Marketplace (chủ trạm tự đăng ký trạm độc lập)
- Khách vãng lai không tài khoản; thanh toán tiền mặt tại trạm
- Môn Phân tích & trực quan hoá dữ liệu (K-Means, dự đoán nhu cầu, Power BI)
- Điều khiển thiết bị từ server (khoá/mở cổng, dừng sạc từ xa) — mạch chỉ gửi 1 chiều
- Hoàn tiền tự động qua API VNPay — admin hoàn tay rồi xác nhận
- Routing thật tới trạm (OSRM/pgRouting) — dùng đường chim bay
- Đánh giá trạm, chatbot, ví điện tử, app mobile/PWA, gói VIP, gợi ý trạm theo tuyến đường
