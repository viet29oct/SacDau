# Đọc file này trước — trạng thái dự án SacDau

Cập nhật lần cuối: **2026-10-13** (cuối phiên 2: xong Phase 3, chuẩn bị dựng khung frontend). File này tóm tắt các phiên làm việc gần nhất, để mở lại dự án mà không cần đọc lại từ đầu. Chi tiết đầy đủ nằm ở các file khác trong `docs/`, file này chỉ là bản tóm tắt + điểm vào.

---

## Đã xong (Phase 0 → 3)

- **Phase 0**: repo `SacDau` trên GitHub, clone về `D:\project k7\SacDau`, cấu trúc thư mục (`iot/`, `backend/`, `frontend/`, `gis/`, `analytics/`, `security/`, `docs/`), `.gitignore`, `.nvmrc` (Node `24.19.0`).
- **Phase 1**: `docker-compose.yml` chạy Postgres+PostGIS và Mosquitto; backend khung Express viết bằng **TypeScript**; migration quản lý bằng **node-pg-migrate**; `GET /health` đã test connect DB thành công.
- **Phase 2**: `docs/contracts.md` (JSON contract MQTT + API) và `docs/FEATURES.md` (phạm vi tính năng cuối cùng) đã soạn xong. Thêm bảng `payments` + luồng **thanh toán VNPay sandbox** (pay sau khi phiên sạc kết thúc).
- **Phase 3 — Auth & RBAC** (đã merge vào `main`, commit `11758b6`):
  - `/auth/register|login|refresh`, `/users/me`, `GET /users` (admin), `PATCH /users/:id` (chính chủ/admin).
  - Middleware dùng chung: `authMiddleware`, `rbacMiddleware(...roles)`, helper `assertOwnerOrAdmin` (chống IDOR — Người 3 dùng lại cho `/stations`, mình dùng cho `/bookings`).
  - Route mới: bọc handler async bằng `asyncHandler` + `throw new AppError(status, code, message)` (`src/utils/http.ts`); `middleware/errorHandler.ts` tự trả đúng envelope.
  - Test: `npm test` trong `backend/` — 29 test jest+supertest, chạy trên DB riêng `sacdau_test`.
  - Thêm error code `EMAIL_ALREADY_EXISTS` (409) vào `contracts.md`.

---

## Git — trạng thái nhánh

| Nhánh | Ý nghĩa |
|---|---|
| `main` | `11758b6` — Phase 3 đã merge. Lịch sử đã được viết lại để xoá dòng `Co-Authored-By: Claude` (bỏ luôn merge commit của PR #1, lịch sử giờ thẳng) |
| `Viet` | Nhánh làm việc của mình (Người 2 — backend core, bảo mật, khung frontend). **Code tiếp ở đây** |
| `Phi`, `Huan` | Nhánh của 2 bạn, tạo từ `main` `11758b6`, đã push lên GitHub |

- Nhóm đổi sang **mỗi người 1 nhánh theo tên** (`Viet`/`Phi`/`Huan`) thay cho `feature/...` — `docs/QUY_TAC_LAM_VIEC_NHOM.md` mục 2 vẫn ghi `feature/...`, **cần sửa lại cho khớp** và báo nhóm.
- Merge vào `main` qua PR. Máy **chưa cài GitHub CLI (`gh`)** → PR phải mở trên web: `https://github.com/viet29oct/SacDau/compare/main...Viet?expand=1`.
- **Không ghi attribution Claude** (`Co-Authored-By`, "Generated with Claude Code") vào commit/PR của repo này.

---

## Quyết định quan trọng đã chốt (đừng đổi lại mà không báo nhóm)

| Quyết định | Giá trị |
|---|---|
| Ngôn ngữ backend | TypeScript |
| Migration | node-pg-migrate (không viết SQL tay) |
| Cổng Postgres (host) | **`5433`**, không phải `5432` — máy có Postgres native sẵn chiếm `5432` |
| Backend chạy ở đâu | Local (`npm run dev`), chỉ Postgres+Mosquitto trong Docker |
| Mật khẩu | `bcryptjs` (thuần JS, không build native) |
| JWT | access 15m (`JWT_SECRET`) + refresh 7d (`JWT_REFRESH_SECRET`), refresh stateless (chưa thu hồi được token — chấp nhận ở quy mô đồ án) |
| Tài khoản admin | Không tự đăng ký qua API; tạo bằng `npm run create-admin -- "Tên" email matkhau` |
| Thanh toán | VNPay sandbox, pay sau khi phiên sạc kết thúc |
| Đã cắt khỏi scope | Routing thật (OSRM), review trạm, chatbot, ví giả lập, PWA/VIP — xem `docs/FEATURES.md` mục 4 |

---

## Trạng thái máy lúc dừng (2026-10-13)

- Docker containers **đang chạy**: `sacdau_postgres` (cổng `5433`), `sacdau_mosquitto` (`1883`/`9001`). Tắt máy rồi mở lại: `docker compose up -d` — **không cần migrate lại**.
- DB `sacdau_test` (cùng container) cho jest. Máy mới: tạo DB này rồi `npm run test:db:migrate` (xem `backend/.env.example`).
- Đã cài skill **UI/UX Pro Max** (`npx ui-ux-pro-max-cli@2.15.0 init --ai claude`) vào `.claude/skills/` (7 skill: `ui-ux-pro-max`, `ui-styling`, `design-system`, `design`, `brand`, `banner-design`, `slides`). **Không commit** — `.claude/` đã nằm trong `.gitignore`; ai muốn dùng tự chạy lệnh trên. Dùng khi dựng/đánh giá giao diện frontend.
- Terminal của mình: dùng cả PowerShell lẫn Git Bash (MINGW64) — lệnh đưa cho mình chạy tay phải ghi rõ cho shell nào (PowerShell không có `grep`).

---

## Việc còn treo (không phải code)

- [ ] Sửa mô tả PR #1 trên GitHub: xoá dòng `🤖 Generated with Claude Code` (tab Commits của PR #1 vẫn giữ commit cũ `6c05075` có dòng Claude — GitHub không cho xoá, chấp nhận).
- [ ] Add Phi + Huan làm collaborator trên GitHub (Settings → Collaborators) + bật branch protection cho `main`.
- [ ] Gửi `docs/FEATURES.md` + `docs/contracts.md` cho 2 bạn đọc, xác nhận đồng ý trong group chat.
- [ ] Báo nhóm: error code mới `EMAIL_ALREADY_EXISTS`; cách dùng `authMiddleware`/`rbacMiddleware`/`assertOwnerOrAdmin`; quy tắc nhánh mới `Viet`/`Phi`/`Huan`.
- [ ] Thông báo khoá file config/DB lên group chat (mẫu câu ở `docs/QUY_TAC_LAM_VIEC_NHOM.md` mục 3).
- [ ] Đăng ký sandbox `sandbox.vnpayment.vn` để lấy `VNPAY_TMN_CODE` + `VNPAY_HASH_SECRET` (trước khi code thanh toán).

---

## Tiếp theo: dựng khung frontend (đang làm dở ở bước chốt lựa chọn)

Việc này thuộc Người 2 (mình) theo `QUY_TAC_LAM_VIEC_NHOM.md` mục 2 — khung chung dựng trước, sau đó Người 3 chỉ thêm component (bản đồ Leaflet, biểu đồ). Làm trên nhánh `Viet`.

**Lựa chọn đề xuất (user chưa xác nhận, mặc định nếu không ý kiến): React + Vite + JavaScript + Tailwind**, version khoá cứng. Lý do JS: Người 3 sẽ code vào frontend, quy tắc nhóm ghi `App.jsx`.

Phạm vi khung:
1. Project React + Vite trong `frontend/`, version cứng.
2. Routing + layout chung (navbar, trang 404).
3. API client gốc: gắn `Authorization: Bearer`, đọc envelope `success/data/error`, tự gọi `/auth/refresh` khi access token hết hạn.
4. Trang login/register nối backend thật + route bảo vệ theo role (driver/owner/admin).
5. Trang placeholder: Bản đồ trạm, Đặt chỗ, Báo cáo (Người 3 điền bản đồ/biểu đồ).
6. Backend: đổi `cors()` sang whitelist origin frontend (mục Phase 4).

Sau đó: **Phase 4 — Bảo mật hạ tầng**: `express-rate-limit` cho `/auth/login`, validate body bằng `zod` (hiện validate tay trong `services/users.ts`), logging `pino`/`winston` + ghi `audit_logs`, `npm audit`. Chi tiết ở `docs/ROADMAP.md`.

---

## Bản đồ tài liệu (đọc thêm khi cần, không cần đọc hết)

| File | Nội dung |
|---|---|
| `docs/QUY_TAC_LAM_VIEC_NHOM.md` | Luật làm việc nhóm: version, phân module, file cấu hình, mocking, linter, `.env` |
| `docs/TECH_STACK.md` | Công nghệ dùng cho từng tầng |
| `docs/FEATURES.md` | Phạm vi tính năng đã chốt (theo vai trò + theo môn học) |
| `docs/contracts.md` | JSON contract (MQTT, REST API, object chuẩn, VNPay) |
| `docs/ROADMAP.md` | Checklist chi tiết từng Phase + nhật ký cập nhật theo ngày |
