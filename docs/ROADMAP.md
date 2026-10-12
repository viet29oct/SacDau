# Roadmap — Người 2 (Backend core & Bảo mật) / Người khởi tạo dự án

File này là danh sách việc sống — **tick checkbox khi xong, thêm dòng vào "Nhật ký cập nhật" ở cuối mỗi khi có thay đổi lớn**. Không xoá mục đã làm, chỉ tick `[x]` để sau này cả nhóm biết đã qua giai đoạn nào.

Tham chiếu: `TECH_STACK.md` (công nghệ), `QUY_TAC_LAM_VIEC_NHOM.md` (luật chơi chung).

---

## Phase 0 — Khởi tạo dự án (làm trước, 1 mình)

- [x] Tạo repo Git (`https://github.com/viet29oct/SacDau.git`), clone về máy, push khung ban đầu lên `main`.
- [ ] Thêm 2 thành viên còn lại làm collaborator trên GitHub (Settings → Collaborators) — việc này làm trên web, tool không tự làm được.
- [x] Tạo cấu trúc thư mục gốc theo `TECH_STACK.md` mục 3 (`iot/`, `backend/`, `frontend/`, `gis/`, `analytics/`, `security/`, `docs/`).
- [x] Tạo `.gitignore` gốc (node_modules, .env, __pycache__, venv, *.pbix tạm, .vscode).
- [x] Chuyển `TECH_STACK.md`, `QUY_TAC_LAM_VIEC_NHOM.md`, `ROADMAP.md` vào `docs/` — cần 2 người kia đọc và xác nhận trong group chat.
- [x] Chốt version công cụ theo mục 1 của `QUY_TAC_LAM_VIEC_NHOM.md` (Node `24.19.0`, Python `3.14.x`): tạo `.nvmrc`, tạo `requirements.txt` rỗng ban đầu (sẽ điền sau).
- [x] Nhánh `main` đã có (mặc định khi tạo repo).
- [ ] Bảo vệ nhánh `main` (Settings → Branches → Branch protection rule: require PR review trước khi merge) — làm trên web.
- [ ] Báo nhóm: tạo nhánh riêng theo mẫu `feature/iot-...`, `feature/backend-...`, `feature/gis-...`, không code trực tiếp trên `main`.

## Phase 1 — Hạ tầng & khung server (vùng cấm — chỉ bạn làm)

- [ ] Viết `docker-compose.yml`: service PostgreSQL+PostGIS (image ghi version cụ thể), service Mosquitto (version cụ thể), map port, volume cho data.
- [ ] Test `docker compose up` chạy được, connect vào Postgres bằng `psql`/DBeaver OK.
- [ ] Viết migration khởi tạo schema (`db/migrations/001_init.sql`): bảng `users`, `stations` (có cột `geom`), `ports`, `bookings`, `charging_sessions`, `telemetry`, `audit_logs` — theo gợi ý ở `TECH_STACK.md` mục 2.4.
- [ ] Viết `backend/src/db/index.js` (pool connection `pg`, đọc `DATABASE_URL` từ `.env`).
- [ ] Viết `backend/src/app.js` + `server.js` (khung Express, listen port từ `.env`).
- [ ] Viết `.env.example` đầy đủ biến (PORT, DATABASE_URL, JWT_SECRET, MQTT_BROKER_URL...).
- [ ] Test server chạy `GET /health` trả 200 + kết nối DB thành công.
- [ ] **Thông báo nhóm** theo mẫu câu ở `QUY_TAC_LAM_VIEC_NHOM.md` mục 3 — khoá file config/DB lại, mọi người chỉ import.

## Phase 2 — Chốt contract chung (làm cùng cả nhóm, không làm riêng)

- [ ] Tạo `docs/contracts.md`, soạn trước bản nháp JSON (payload MQTT, response API chuẩn, object `station`) dựa theo mẫu ở `QUY_TAC_LAM_VIEC_NHOM.md` mục 5.
- [ ] Họp nhóm (hoặc chat) để Người 1 (IoT) và Người 3 (GIS/Analytics) góp ý field còn thiếu.
- [ ] Chốt bản cuối, cả 3 người xác nhận đồng ý trong group chat (lưu lại làm "bằng chứng" nếu sau có tranh cãi field).
- [ ] Setup Swagger/OpenAPI (`swagger-ui-express`) khung rỗng, sẽ điền dần khi có route.

## Phase 3 — Auth & RBAC (lõi bảo mật)

- [ ] Route `/auth/register`, `/auth/login` — hash password bằng `bcrypt`.
- [ ] JWT: access token ngắn hạn + refresh token (`jsonwebtoken`).
- [ ] Middleware `authMiddleware` (verify JWT) + `rbacMiddleware` (check role: tài xế / chủ trạm / quản trị viên).
- [ ] Kiểm tra quyền sở hữu tài nguyên (chống IDOR) — ví dụ user A không sửa booking của user B.
- [ ] Route `/users` (CRUD cơ bản, chỉ admin thao tác người khác).
- [ ] Viết test `jest` + `supertest` cho auth (ít nhất: login đúng/sai, token hết hạn, route cần token mà không có token).

## Phase 4 — Bảo mật hạ tầng (song song Phase 3)

- [ ] Cài `helmet` (security headers), `cors` (whitelist origin frontend).
- [ ] Cài `express-rate-limit` cho route login (chống brute force).
- [ ] Input validation bằng `zod`/`joi`/`express-validator` cho toàn bộ route nhận body.
- [ ] Đảm bảo toàn bộ query DB dùng tham số hoá (`$1, $2`), review lại code của Người 1/3 nếu họ viết query trong module của mình.
- [ ] Logging bằng `winston`/`pino`: log đăng nhập, log thao tác nhạy cảm (đổi quyền, xoá dữ liệu).
- [ ] `npm audit` định kỳ, ghi lại kết quả vào `security/`.

## Phase 5 — Route nghiệp vụ còn lại (thuộc phạm vi Người 2)

- [ ] `/bookings` — đặt chỗ sạc, kiểm tra trùng giờ/trùng port.
- [ ] `/reports` — báo cáo tổng hợp (doanh thu, số phiên sạc...).
- [ ] Review PR của `/stations` (Người 3) và `/telemetry` (Người 1) khi họ mở PR — đảm bảo không phá contract đã chốt ở Phase 2.

## Phase 6 — Kiểm thử bảo mật cuối kỳ (phục vụ báo cáo môn Web an toàn)

- [ ] Chạy OWASP ZAP quét toàn bộ API, lưu báo cáo vào `security/zap-report/`.
- [ ] Thử tấn công SQL Injection bằng `sqlmap` lên 1-2 endpoint để chứng minh đã vá (trước/sau khi có tham số hoá).
- [ ] Review code bằng ESLint `eslint-plugin-security` hoặc Semgrep, sửa các warning quan trọng.
- [ ] Viết báo cáo tổng hợp lỗ hổng đã tìm + cách vá (dùng cho báo cáo môn).

## Việc duy trì liên tục (xuyên suốt dự án, không thuộc 1 phase cụ thể)

- [ ] Review PR của 2 người còn lại trước khi merge vào `main`.
- [ ] Mọi thay đổi vào file "vùng cấm" (`docker-compose.yml`, `db/index.js`, `app.js`, migration) — chỉ bạn sửa, nhớ báo nhóm sau khi sửa.
- [ ] Khi có field/API mới phát sinh ngoài kế hoạch — cập nhật `docs/contracts.md` trước, code sau.
- [ ] Theo dõi `.env.example` luôn khớp với biến thực tế đang dùng.
- [ ] Cập nhật `TECH_STACK.md` nếu đổi/thêm công nghệ giữa đường (và báo nhóm).

---

## Nhật ký cập nhật

> Ghi ngắn gọn mỗi khi hoàn thành 1 mốc lớn hoặc đổi hướng. Format: `YYYY-MM-DD — việc đã làm / quyết định thay đổi`.

- 2026-10-12 — Tạo roadmap, chưa bắt đầu Phase 0.
- 2026-10-12 — Bắt đầu Phase 0: clone repo `SacDau` về máy, dựng cấu trúc thư mục, `.gitignore`, `.nvmrc` (24.19.0), `requirements.txt` rỗng, chuyển 3 file docs vào `docs/`. Còn thiếu: add collaborator + bật branch protection trên GitHub (web, chưa tự làm được), và báo nhóm quy tắc tạo nhánh `feature/...`.
