# Danh sách tính năng đã chốt — SacDau

File này là **phạm vi cuối cùng**. Không thêm tính năng mới giữa đường trừ khi cả nhóm đồng ý và cập nhật lại file này trước. Mục tiêu: tránh vừa code vừa nghĩ thêm, dẫn tới trễ deadline.

Đặc tả luồng nghiệp vụ chi tiết (thứ tự bước, kịch bản xấu và cách chặn): **`docs/LUONG_NGHIEP_VU.md`**. Field/endpoint: `docs/contracts.md`.

---

## 1. Theo vai trò (đã chốt — [Bắt buộc] trừ khi ghi chú khác)

> **Mô hình vận hành:** 1 công ty vận hành nhiều trạm sạc (2026-10-29). `admin` tạo trạm và phân công `owner` quản lý. Mạch IoT chỉ gửi 1 chiều nên **quản lý trạm là cầu nối người–thiết bị**: chỉ cho người đã check-in cắm súng (2026-11-18). Mọi khách hàng phải có tài khoản — không có khách vãng lai.

**Tài xế** (`driver`)
- Đăng ký / đăng nhập
- Tìm trạm trên bản đồ (public), lọc theo trạng thái/khoảng cách (nearest neighbor, đường chim bay)
- Xem chi tiết trạm + trạng thái từng cổng (real-time qua WebSocket)
- Đặt chỗ theo khung giờ (15 phút – 4 giờ, trong giờ phục vụ 6h–22h), **trả cọc VNPay ngay khi đặt** (5 phút không trả → tự huỷ); "đặt ngay tại trạm" khi đến mà chưa đặt
- Huỷ đặt chỗ (huỷ trước ≥ 2 giờ được hoàn cọc)
- Nhận mã check-in 6 số, đưa cho quản lý trạm khi đến
- Theo dõi phiên sạc real-time, nhận cảnh báo khi xe đầy pin/bắt đầu tính phí chiếm chỗ
- Lịch sử phiên sạc + chi phí; **trả phần còn lại qua VNPay** sau khi trừ cọc (còn nợ thì không đặt chỗ mới được)

**Quản lý trạm** (`owner` — nhân viên do admin tạo và phân công, không tự đăng ký)
- Xem trạm được phân công và danh sách booking hôm nay
- **Check-in tài xế bằng mã**, đổi cổng khi cổng đã đặt hỏng/bị chiếm, gắn phiên cho booking khi tài xế cắm trước/cắm lại
- Nhận cảnh báo: phiên trái phép (người chưa check-in cắm súng), xe đầy pin chiếm cổng, cổng lỗi/mất kết nối
- Bật/tắt bảo trì cổng; huỷ booking bị ảnh hưởng (hoàn cọc cho tài xế)
- Đóng phiên thủ công khi thiết bị mất kết nối (có giới hạn số kWh, ghi audit)
- Xem/đóng sự cố; xem doanh thu, tỷ lệ sử dụng các trạm được phân công
- **Không thu/chi tiền mặt** — mọi khoản tiền qua VNPay

**Admin**
- Quản lý user: tạo tài khoản quản lý trạm, khoá/mở tài khoản (RBAC 3 vai trò)
- Tạo/sửa/ngừng hoạt động trạm và cổng, phân công `owner` quản lý từng trạm
- Xử lý danh sách cọc/giao dịch **cần hoàn** (hoàn tay rồi xác nhận trên hệ thống)
- Dashboard tổng: doanh thu, đã thu, còn nợ, cọc bị mất, thất thoát do phiên trái phép, giờ cao điểm

**Hệ thống / IoT**
- ESP32 (hoặc mock) gửi telemetry qua MQTT (1 chiều, broker có xác thực theo trạm) → backend tự suy ra phiên sạc từ chuỗi `status`; phiên chỉ gắn với tài xế qua check-in
- Phát hiện cổng mất kết nối (watchdog), mô phỏng trạng thái `fault` (quá nhiệt), tự mở sự cố
- Phát hiện xe đầy pin (công suất ≈ 0) để tính phí chiếm chỗ

---

## 2. Theo môn học (để báo cáo không sót yêu cầu)

Dự án dùng chung **4 môn**: IoT, Ngôn ngữ kịch bản, Web an toàn, GIS. *(Môn Phân tích & trực quan hoá dữ liệu không còn thuộc dự án này — bỏ từ 2026-11-18.)*

| Môn | Tính năng/kỹ thuật minh chứng |
|---|---|
| IoT | ESP32/Wokwi → MQTT (broker có user/password + ACL theo trạm) → backend; mô phỏng fault, phát hiện offline bằng heartbeat |
| Ngôn ngữ kịch bản | REST API đầy đủ (Express), WebSocket đẩy trạng thái real-time, state machine phiên sạc/booking, job định kỳ (hết hạn cọc, no-show, watchdog) |
| Web an toàn | JWT/RBAC/validate/rate-limit; **case study** SQL Injection (cố ý để lỗi 1 endpoint thử nghiệm, chứng minh bằng `sqlmap`, vá bằng tham số hoá); verify HMAC-SHA512 + **so số tiền** ở VNPay IPN; chống dò email qua thời gian phản hồi; chống IDOR theo `owner` được phân công; **chống dò mã check-in** (khoá sau 5 lần sai); chống race condition bằng exclusion constraint/khoá dòng; thu hồi quyền tức thì khi khoá tài khoản; WebSocket có xác thực (không lộ dữ liệu phiên của người khác) |
| GIS | (1) Buffer vùng phục vụ mỗi trạm + tìm khoảng trống chưa phủ sóng; (2) Nearest neighbor tìm trạm gần nhất; (3) Đếm điểm trong vùng phục vụ (nếu có dữ liệu OSM) |

**Lưu ý khi viết báo cáo:** mỗi người tự lập 1 bảng "tính năng đã làm → mục yêu cầu cụ thể trong đề cương môn" trong phần báo cáo của mình, trỏ đúng vào code/kết quả.

---

## 3. Thanh toán VNPay sandbox — tóm tắt luồng

Chi tiết: `docs/LUONG_NGHIEP_VU.md` mục 4, 9 và `docs/contracts.md` mục 4.

1. **Cọc khi đặt chỗ**: `POST /bookings` tạo booking `pending` + giao dịch cọc (mặc định 20.000đ) → tài xế trả trên VNPay trong 5 phút → IPN xác nhận → booking `confirmed` + mã check-in. Không trả → tự huỷ, nhả slot.
2. **Sau phiên sạc**: tổng tiền = tiền điện (kWh × đơn giá lúc mở phiên) + phí chiếm chỗ; trừ cọc → `amountDue`. Tài xế bấm "Thanh toán" → `POST /payments` → trả trên VNPay → IPN xác nhận.
3. Tổng < cọc → cọc là phí tối thiểu (không hoàn phần dư). No-show / huỷ sát giờ → mất cọc. Huỷ trước ≥ 2 giờ hoặc quản lý/admin huỷ → cọc **cần hoàn** (admin hoàn tay rồi xác nhận).
4. Chỉ **IPN** (VNPay gọi server-to-server) mới cập nhật DB; backend verify `vnp_SecureHash` + so số tiền trước khi tin. `vnpay-return` chỉ để hiển thị kết quả cho người dùng.
5. Khi demo trên máy cá nhân phải mở tunnel để VNPay gọi được IPN (xem `LUONG_NGHIEP_VU.md` mục 13).

---

## 4. Đã cắt khỏi phạm vi (ghi lại để không ai đề xuất lại giữa đường)

- Mô hình marketplace (chủ trạm tự đăng ký trạm độc lập) — đổi sang 1 công ty vận hành nhiều trạm *(2026-10-29)*.
- **Khách vãng lai không tài khoản** và **thanh toán tiền mặt tại trạm** — mọi khách phải đăng nhập, mọi khoản tiền qua VNPay *(2026-11-18)*.
- **Môn Phân tích & trực quan hoá dữ liệu** (K-Means, dự đoán nhu cầu, Apriori, Power BI) — không còn thuộc dự án *(2026-11-18)*.
- Điều khiển thiết bị từ server (khoá/mở cổng, dừng sạc từ xa) — mạch chỉ gửi 1 chiều.
- Hoàn tiền tự động qua API VNPay — admin hoàn tay rồi xác nhận.
- Routing thật tới trạm (OSRM/pgRouting) — dùng nearest-neighbor đường chim bay.
- Đánh giá/review trạm. Chatbot/FAQ. Ví điện tử giả lập riêng.
- Ứng dụng mobile/PWA, gói thành viên VIP, gợi ý trạm theo tuyến đường đang đi.

Muốn thêm lại bất kỳ mục nào ở trên: phải họp nhóm và cập nhật file này trước, không tự thêm vào code.
