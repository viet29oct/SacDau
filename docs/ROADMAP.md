# Roadmap — Người 2 (Backend core & Bảo mật) / Người khởi tạo dự án

File này là danh sách việc sống — **tick checkbox khi xong, thêm dòng vào "Nhật ký cập nhật" ở cuối mỗi khi có thay đổi lớn**. Không xoá mục đã làm, chỉ tick `[x]` để sau này cả nhóm biết đã qua giai đoạn nào.

Tham chiếu: `TECH_STACK.md` (công nghệ), `QUY_TAC_LAM_VIEC_NHOM.md` (luật chơi chung), `FEATURES.md` (phạm vi tính năng đã chốt), `contracts.md` (JSON contract).

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

- [x] Viết `docker-compose.yml`: service PostgreSQL+PostGIS (`postgis/postgis:16-3.4`), service Mosquitto (`eclipse-mosquitto:2.0.18`), volume `pgdata`.
  - ⚠️ Máy khởi tạo dự án có Postgres native sẵn chiếm cổng `5432` → đã đổi cổng host Postgres sang **`5433`** (`DATABASE_URL` trong `.env.example` đã trỏ đúng). Ai máy sạch vẫn connect bình thường qua `5433`.
- [x] Test `docker compose up` chạy được, connect Postgres OK (test qua `/health`, xem bên dưới).
- [x] Viết migration khởi tạo schema bằng **node-pg-migrate** (`backend/migrations/1791819717249_init.js`): bảng `users`, `stations` (có cột `geom`), `ports`, `bookings`, `charging_sessions`, `telemetry`, `audit_logs` — theo gợi ý ở `TECH_STACK.md` mục 2.4. Đã chạy `npm run migrate:up` thành công.
- [x] Viết `backend/src/db/index.ts` (pool connection `pg`, đọc `DATABASE_URL` từ `.env`).
- [x] Viết `backend/src/app.ts` + `server.ts` bằng **TypeScript** (khung Express + helmet + cors, listen port từ `.env`).
- [x] Viết `.env.example` ở root (Postgres) và `backend/.env.example` (PORT, DATABASE_URL, JWT_SECRET, MQTT_BROKER_URL).
- [x] Test server chạy `GET /health` trả 200 + kết nối DB thành công — đã verify: `{"success":true,"data":{"status":"ok","db":"connected"}}`.
- [ ] **Thông báo nhóm** theo mẫu câu ở `QUY_TAC_LAM_VIEC_NHOM.md` mục 3 — khoá file config/DB lại, mọi người chỉ import. (Bạn tự gửi vào group chat.)

## Phase 2 — Chốt contract chung (làm cùng cả nhóm, không làm riêng)

- [x] Tạo `docs/contracts.md`: MQTT payload (1 topic duy nhất `stations/{stationId}/status`), response envelope chuẩn, object `User`/`Station`/`Port`/`Booking`/`ChargingSession`, danh sách đầy đủ endpoint theo đúng người phụ trách ở mục 2 của `QUY_TAC_LAM_VIEC_NHOM.md`. Khớp 1:1 với schema đã migrate ở Phase 1.
- [ ] Gửi `docs/contracts.md` cho Người 1 (IoT) và Người 3 (GIS/Analytics) đọc, góp ý field còn thiếu trước khi code route/giao diện.
- [ ] Chốt bản cuối, cả 3 người xác nhận đồng ý trong group chat (lưu lại làm "bằng chứng" nếu sau có tranh cãi field).
- [ ] Setup Swagger/OpenAPI (`swagger-ui-express`) khung rỗng, sẽ điền dần khi có route.

## Phase 3 — Auth & RBAC (lõi bảo mật)

- [x] Route `/auth/register`, `/auth/login` — hash password bằng `bcrypt`.
- [x] JWT: access token ngắn hạn + refresh token (`jsonwebtoken`).
- [x] Middleware `authMiddleware` (verify JWT) + `rbacMiddleware` (check role: tài xế / chủ trạm / quản trị viên).
- [x] Kiểm tra quyền sở hữu tài nguyên (chống IDOR) — ví dụ user A không sửa booking của user B.
- [x] Route `/users` (CRUD cơ bản, chỉ admin thao tác người khác).
- [x] Viết test `jest` + `supertest` cho auth (ít nhất: login đúng/sai, token hết hạn, route cần token mà không có token).

## Phase 4 — Bảo mật hạ tầng (song song Phase 3)

- [x] Cài `helmet` (security headers), `cors` (whitelist origin frontend) — `cors({ origin: process.env.FRONTEND_URL })`, mặc định `http://localhost:5173`.
- [ ] Cài `express-rate-limit` cho route login (chống brute force).
- [ ] Input validation bằng `zod`/`joi`/`express-validator` cho toàn bộ route nhận body.
- [ ] Đảm bảo toàn bộ query DB dùng tham số hoá (`$1, $2`), review lại code của Người 1/3 nếu họ viết query trong module của mình.
- [ ] Logging bằng `winston`/`pino`: log đăng nhập, log thao tác nhạy cảm (đổi quyền, xoá dữ liệu).
- [ ] `npm audit` định kỳ, ghi lại kết quả vào `security/`.

## Phase 5 — Route nghiệp vụ còn lại (thuộc phạm vi Người 2)

- [ ] `/bookings` — đặt chỗ sạc, kiểm tra trùng giờ/trùng port.
- [ ] `/reports` — báo cáo tổng hợp (doanh thu, số phiên sạc...).
- [ ] **Đăng ký tài khoản sandbox VNPay** tại `sandbox.vnpayment.vn`, lấy `VNPAY_TMN_CODE` + `VNPAY_HASH_SECRET`, điền vào `backend/.env` (không commit).
- [ ] Viết `backend/src/services/vnpay.ts` — helper build URL thanh toán (ký HMAC-SHA512) + verify signature khi nhận callback.
- [ ] Route `/payments` (POST tạo thanh toán, GET xem trạng thái), `/payments/vnpay-return`, `/payments/vnpay-ipn` — đúng theo `docs/contracts.md` mục 4.
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
- 2026-10-12 — Hoàn thành Phase 1: `docker-compose.yml` (Postgres+PostGIS cổng `5433` do máy có Postgres native sẵn, Mosquitto cổng `1883`/`9001`), backend chuyển sang **TypeScript**, migration bằng **node-pg-migrate** (schema 7 bảng đã chạy thành công), `/health` test connect DB OK. Còn thiếu: gửi tin thông báo khoá file config/DB lên group chat (mẫu câu có sẵn ở `QUY_TAC_LAM_VIEC_NHOM.md` mục 3).
- 2026-10-12 — Soạn bản nháp `docs/contracts.md` (MQTT 1 topic, response envelope, object chuẩn, endpoint đầy đủ theo người phụ trách). Bạn sẽ đưa nhóm đọc và yêu cầu tuân theo — còn thiếu bước xác nhận cả 3 người đồng ý trong chat.
- 2026-10-12 — Chốt phạm vi tính năng cuối cùng (`docs/FEATURES.md`): cắt routing thật/review/chatbot/ví giả lập, **giữ lại thanh toán VNPay sandbox** gắn vào phiên sạc đã kết thúc. Đã thêm bảng `payments` (migration mới, chạy thành công), cập nhật `contracts.md` (object `Payment`, endpoint `/payments/*`, 2 route ngoại lệ không theo envelope chuẩn vì VNPay quy định format riêng) và `.env.example` (`VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`...). Còn thiếu: đăng ký tài khoản sandbox VNPay để lấy TMN code/hash secret thật (xem Phase 5).
- 2026-10-13 — Xong Phase 3 (nhánh `feature/backend-auth`): register/login/refresh (JWT access 15m + refresh 7d, 2 secret riêng), `authMiddleware` + `rbacMiddleware` + `assertOwnerOrAdmin` (chống IDOR), `/users/me`, `/users`, `PATCH /users/:id`, error handler chung; 29 test jest+supertest chạy trên DB riêng `sacdau_test`. Dùng `bcryptjs` thay `bcrypt` (thuần JS, không cần build native trên Windows). Thêm error code `EMAIL_ALREADY_EXISTS`.
- 2026-10-13 — Viết lại lịch sử `main` để xoá attribution Claude (main = `11758b6`). Tạo nhánh cá nhân `Viet`/`Phi`/`Huan`. Cài skill UI/UX Pro Max local (`.claude/`, không commit). Kế tiếp: dựng khung frontend (React + Vite, đề xuất JS + Tailwind).
- 2026-10-13 — Dựng khung frontend (`frontend/`): React `19.3.0` + Vite `8.3.4` (JS, version cứng) + **Tailwind v4** (`@tailwindcss/vite`, không cần `tailwind.config.js`) + `react-router-dom` `7.18.4`. API client `src/api/client.js` (envelope `success/data/error`, tự gọi `/auth/refresh` khi gặp `UNAUTHORIZED` rồi retry 1 lần). Auth state qua React Context (`src/context/AuthContext.jsx`, hook `useAuth`), token lưu `localStorage`. `ProtectedRoute` theo role (`driver`/`owner`/`admin`). Trang `Login`/`Register` nối backend thật, trang placeholder `Stations`/`Bookings`/`Reports` (Người 3 điền bản đồ/biểu đồ), `404`. Component UI tự viết bằng Tailwind thuần (`Button`/`Input`/`Card`), không dùng thư viện component. Giao diện tiếng Việt, chưa làm dark mode. Backend: đổi `cors()` sang whitelist `FRONTEND_URL` (`backend/src/app.ts`, `.env.example` + `.env` cục bộ đã thêm biến). Đã test thủ công bằng `curl` (register → login → `/users/me` với token, kiểm tra header `Access-Control-Allow-Origin`) — không test được bằng browser tự động do Chrome extension chưa kết nối. Còn thiếu: ESLint/Prettier cho `frontend/` (mục 7 `QUY_TAC_LAM_VIEC_NHOM.md`, backend cũng chưa có), ai mở app cần tự mở browser kiểm tra UI bằng mắt.
- 2026-10-14 — Thêm **landing page công khai** ở `/` (`frontend/src/pages/LandingPage.jsx`), không còn bắt đăng nhập ngay khi vào web. Màu brand `navy` (`#113259`) + `forest` (`#2A623D`) khai báo qua Tailwind v4 `@theme` (`src/index.css`), áp lại cho toàn bộ UI cũ (Button/Input/Navbar/Login/Register — trước đó tạm dùng `emerald`). Hero có ảnh nền (`public/images/bg1.jpg`, đã resize+compress bằng `sharp` dùng tạm rồi gỡ, không thêm vào `package.json`) + gradient bám theo chuột (`hooks/useMouseGradient.js`) + khối glassmorphism + parallax nhẹ (`hooks/useParallax.js`). Scroll reveal (`components/landing/Reveal.jsx`, IntersectionObserver) và animation counter (`components/landing/Counter.jsx`) dùng lại ở section Thống kê/Tính năng/Quy trình/Vai trò. Section "Lựa chọn vai trò" (ảnh `taixe.png`/`chutram.png`) check đăng nhập trước khi chuyển hướng — chưa đăng nhập thì hiện modal (`AuthGateModal.jsx`) mời đăng nhập thay vì chuyển trang luôn.
  - **Đổi cấu trúc route quan trọng**: `/` không còn là trang dashboard sau đăng nhập — tách thành `/driver-dashboard` (role `driver`) và `/station-dashboard` (role `owner`), map qua `src/utils/roleDashboard.js`. Sau login/register, điều hướng theo role (admin → `/reports`, tạm thời vì chưa có trang admin riêng — xem phần "Việc còn treo"). Thêm 3 trang placeholder công khai `/gioi-thieu`, `/tin-tuc`, `/ho-tro`.
  - Thêm `frontend/public/favicon.svg` (khắc phục 404 favicon thấy trong console log).
  - Test: build `vite build` qua, dev server `curl` từng file nguồn (200 OK, không lỗi transform), **chưa xem bằng mắt** (Chrome extension của Claude vẫn chưa kết nối được) — bạn cần tự mở `npm run dev` và kiểm tra lại hiệu ứng động, responsive mobile, đặc biệt là gradient theo chuột và glassmorphism ở Hero.
