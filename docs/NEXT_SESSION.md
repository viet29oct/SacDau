# Đọc file này trước — trạng thái dự án SacDau

Cập nhật lần cuối: **2026-10-13**. File này tóm tắt toàn bộ phiên làm việc gần nhất, để mở lại dự án mà không cần đọc lại từ đầu. Chi tiết đầy đủ nằm ở các file khác trong `docs/`, file này chỉ là bản tóm tắt + điểm vào.

---

## Đã xong (Phase 0 → 2)

- **Phase 0**: repo `SacDau` trên GitHub, clone về `D:\project k7\SacDau`, cấu trúc thư mục (`iot/`, `backend/`, `frontend/`, `gis/`, `analytics/`, `security/`, `docs/`), `.gitignore`, `.nvmrc` (Node `24.19.0`).
- **Phase 1**: `docker-compose.yml` chạy Postgres+PostGIS và Mosquitto; backend khung Express viết bằng **TypeScript**; migration quản lý bằng **node-pg-migrate**; `GET /health` đã test connect DB thành công.
- **Phase 2**: `docs/contracts.md` (JSON contract MQTT + API) và `docs/FEATURES.md` (phạm vi tính năng cuối cùng, đã cắt/giữ rõ ràng) đã soạn xong.
- Thêm bảng `payments` + luồng **thanh toán VNPay sandbox** (sau khi phiên sạc kết thúc, không pay lúc đặt chỗ).

Tất cả đã **commit và push** lên `main`. Không có gì đang treo nửa vời trong code.

---

## Quyết định quan trọng đã chốt (đừng đổi lại mà không báo nhóm)

| Quyết định | Giá trị |
|---|---|
| Ngôn ngữ backend | TypeScript (không phải JS thuần như bản đầu) |
| Migration | node-pg-migrate (không viết SQL tay) |
| Cổng Postgres (host) | **`5433`**, không phải `5432` — máy khởi tạo dự án có Postgres native sẵn chiếm `5432` |
| Backend chạy ở đâu | Local (`npm run dev`), chỉ Postgres+Mosquitto trong Docker |
| Thanh toán | VNPay sandbox, pay sau khi phiên sạc kết thúc |
| Đã cắt khỏi scope | Routing thật (OSRM), review trạm, chatbot, ví giả lập, PWA/VIP — xem `docs/FEATURES.md` mục 4 |

---

## Trạng thái máy lúc dừng (2026-10-13)

- Docker containers **đang chạy**: `sacdau_postgres` (cổng `5433`), `sacdau_mosquitto` (`1883`/`9001`).
- Nếu tắt máy/Docker Desktop rồi mở lại: chạy `docker compose up -d` trong `D:\project k7\SacDau` — **không cần migrate lại**, data đã nằm trong volume `pgdata`.
- Backend chưa chạy liên tục nền (chỉ test tạm bằng `tsx` rồi tắt) — mai chạy `npm run dev` trong `backend/` khi cần.

---

## Việc còn treo, không gấp nhưng nên làm (không phải code)

- [ ] Add 2 thành viên làm collaborator trên GitHub (Settings → Collaborators) + bật branch protection cho `main`.
- [ ] Gửi `docs/FEATURES.md` + `docs/contracts.md` cho 2 bạn đọc, xác nhận đồng ý trong group chat.
- [ ] Thông báo khoá file config/DB lên group chat (mẫu câu có sẵn ở `docs/QUY_TAC_LAM_VIEC_NHOM.md` mục 3).
- [ ] Đăng ký tài khoản sandbox tại `sandbox.vnpayment.vn` để lấy `VNPAY_TMN_CODE` + `VNPAY_HASH_SECRET` (chỉ cần trước khi code phần thanh toán, chưa gấp).

---

## Tiếp theo: Phase 3 — Auth & RBAC

Việc kế tiếp theo roadmap: `/auth/register`, `/auth/login`, JWT (access + refresh), middleware auth/RBAC, chống IDOR, test `jest`+`supertest`. Chi tiết đầy đủ ở `docs/ROADMAP.md` mục Phase 3.

---

## Bản đồ tài liệu (đọc thêm khi cần, không cần đọc hết)

| File | Nội dung |
|---|---|
| `docs/QUY_TAC_LAM_VIEC_NHOM.md` | Luật làm việc nhóm: version, phân module, file cấu hình, mocking, linter, `.env` |
| `docs/TECH_STACK.md` | Công nghệ dùng cho từng tầng |
| `docs/FEATURES.md` | Phạm vi tính năng đã chốt (theo vai trò + theo môn học) |
| `docs/contracts.md` | JSON contract (MQTT, REST API, object chuẩn, VNPay) |
| `docs/ROADMAP.md` | Checklist chi tiết từng Phase + nhật ký cập nhật theo ngày |
