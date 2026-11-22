# Tài khoản test VNPay (sandbox)

Thẻ test công khai do VNPay cung cấp cho môi trường sandbox (`sandbox.vnpayment.vn`). Không phải thẻ thật, chỉ dùng được trên cổng sandbox.

| Trường | Giá trị |
|---|---|
| Ngân hàng | NCB |
| Số thẻ | `9704198526191432198` |
| Tên chủ thẻ | `NGUYEN VAN A` |
| Ngày phát hành | `07/15` |
| Mật khẩu OTP | `123456` |

## Mới pull project về thì cần gì

`backend/.env` không lên repo (bị `.gitignore`), nên pull về chỉ có `.env.example` với `VNPAY_TMN_CODE=change_me`. Thiếu key thì backend tạo link sai chữ ký, VNPay từ chối ngay.

Lấy key bằng một trong hai cách:

- **Xin key của người trong nhóm**: gửi riêng qua Zalo/Messenger, tự dán vào `backend/.env`. Không commit key lên repo, kể cả key sandbox.
- **Tự đăng ký merchant sandbox** tại `sandbox.vnpayment.vn` để có `TMN_CODE` + `HASH_SECRET` riêng. Nên chọn cách này nếu nhiều người cùng test.

Lý do nên có key riêng: DB chỉ được cập nhật khi VNPay gọi IPN, mà mỗi `TMN_CODE` chỉ khai được **một** IPN URL trên cổng merchant. Dùng chung key thì IPN về máy người đã khai URL, máy mình thanh toán xong vẫn thấy trang kết quả nhưng booking không được ghi nhận và tự huỷ sau 5 phút.

| Có gì | Thanh toán + trang kết quả | DB cập nhật (IPN) |
|---|---|---|
| Chỉ pull code | ❌ | ❌ |
| Key của người khác | ✅ | ❌ (IPN về máy họ) |
| Key riêng + tunnel + khai IPN | ✅ | ✅ |

Tunnel và khai IPN: xem `README.md` mục "Demo VNPay thật" (VNPay không gọi được `localhost`).

## Cách test

1. Đặt `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` trong `backend/.env` (xem mục trên).
2. Tạo thanh toán trên app, bị chuyển sang trang VNPay sandbox.
3. Chọn **Thẻ nội địa và tài khoản ngân hàng** → **NCB**, nhập thông tin thẻ ở bảng trên.
4. Nhập OTP `123456`, xác nhận. VNPay redirect về `VNPAY_RETURN_URL`.
