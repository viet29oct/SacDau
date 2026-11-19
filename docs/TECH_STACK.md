# Tech stack — SacDau

Công nghệ và version đã chốt cho từng tầng. Đổi/thêm công nghệ lõi → báo nhóm trước, sửa file này rồi mới sửa code.

Cột **Trạng thái**: ✅ đang dùng trong code · 🕓 đã chọn, chưa cài.

---

## 1. Version chốt (bắt buộc giống nhau trên mọi máy)

| Thành phần | Version | Khai báo ở | Ghi chú |
|---|---|---|---|
| Node.js | `24.19.0` | `.nvmrc` | Chạy `nvm use` trước khi code |
| Package npm | số cứng, không `^`/`~` | `package.json` + `package-lock.json` (commit cả 2) | Cài bằng `npm ci`; không `--force`, không xoá lock file |
| PostgreSQL + PostGIS | `postgis/postgis:16-3.4` | `docker-compose.yml` | Không dùng `latest`. Cổng host **`5433`** |
| Mosquitto | `eclipse-mosquitto:2.0.18` | `docker-compose.yml` | |
| Python | `3.14.x` | `requirements.txt` (version cố định) | `venv` riêng; PyQGIS chạy bằng Python đi kèm QGIS |
| QGIS | **3.44 LTR** | — | Không dùng 4.x: QuickOSM lỗi access violation trên 4.2.2 |

## 2. Tổng quan theo tầng

| Tầng | Công nghệ | Môn |
|---|---|---|
| Thiết bị | ESP32 mô phỏng trên Wokwi, C++ (Arduino framework, build bằng PlatformIO) | IoT |
| Truyền thông | MQTT, broker Mosquitto có xác thực + ACL | IoT |
| Backend | Node.js + Express, **JavaScript CommonJS** (không TypeScript, không bước build) | Ngôn ngữ kịch bản |
| Bảo mật | JWT, bcrypt, helmet, zod, rate-limit, audit log | Web an toàn |
| CSDL | PostgreSQL + PostGIS | Dùng chung |
| Frontend | React + Vite + Tailwind, Leaflet | Web an toàn, GIS |
| GIS desktop | QGIS + PyQGIS | GIS |

---

## 3. Chi tiết

### 3.1 IoT

| Thành phần | Công nghệ | Trạng thái |
|---|---|---|
| Mạch | ESP32 trên Wokwi (`iot/diagram.json`): 2 cổng, mỗi cổng 1 nút bấm (cắm/rút súng) + 3 LED trạng thái; biến trở = công suất; DHT22 = nhiệt độ | ✅ |
| Thư viện | `PubSubClient`, `ArduinoJson`, `DHT sensor library` | ✅ |
| Chạy giả lập | Wokwi cho VS Code (nối broker trên máy qua `host.wokwi.internal`) hoặc wokwi.com (cần broker cloud có TLS) | ✅ |
| Cấu hình bí mật | `iot/secrets.h` (gitignore), mẫu `iot/secrets.example.h` | ✅ |
| Kiểm tra bản tin | MQTT Explorer / MQTTX, hoặc `mosquitto_pub`/`mosquitto_sub` trong container | ✅ |

Topic, payload, ý nghĩa trạng thái: `contracts.md` mục 1. **Không** dùng broker công cộng không mật khẩu (ai cũng giả được bản tin).

### 3.2 Backend

| Thành phần | Công nghệ | Trạng thái |
|---|---|---|
| Framework | `express` | ✅ |
| CSDL | `pg` (truy vấn tham số hoá), migration bằng `node-pg-migrate` (`backend/migrations/*.js`) | ✅ |
| MQTT client | `mqtt` (subscribe `stations/+/status`) | ✅ |
| Real-time | `ws` — WebSocket `/ws`, event ở `contracts.md` mục 1b | ✅ |
| Validate | `zod` (`src/validation/`) | ✅ |
| Log | `pino` + `pino-http`; `src/services/audit.js` ghi thao tác nhạy cảm vào `audit_logs` | ✅ |
| Biến môi trường | `dotenv` | ✅ |
| Hằng số nghiệp vụ | `src/config/rules.js` (đơn giá, cọc, giờ phục vụ, phí chiếm chỗ, các mốc thời gian) | ✅ |
| Job định kỳ | `src/services/scheduler.js` (hết hạn cọc, no-show, watchdog offline) | ✅ |
| Test | `jest` + `supertest` trên DB thật `sacdau_test` | ✅ |
| Tài liệu API | `swagger-ui-express` + OpenAPI | 🕓 |

Bảng đã migrate: `users`, `stations` (cột `geom`), `ports`, `bookings`, `charging_sessions`, `telemetry`, `audit_logs`, `payments`, `incidents`. Extension `postgis` + `btree_gist` (exclusion constraint chống đặt trùng giờ).

### 3.3 Thanh toán

| Thành phần | Công nghệ | Trạng thái |
|---|---|---|
| Cổng | VNPay **sandbox** (`VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` tự đăng ký tại `sandbox.vnpayment.vn`) | ✅ |
| Ký/verify | `crypto` built-in, HMAC-SHA512 (`src/services/vnpay.js`, không dùng SDK) | ✅ |
| Luồng | Cọc khi đặt chỗ + phần còn lại sau phiên; chỉ IPN cập nhật DB | ✅ |
| Đối soát `querydr` | Lưới an toàn khi IPN không tới | 🕓 |

### 3.4 Bảo mật (môn Web an toàn)

| Mục tiêu | Kỹ thuật | Trạng thái |
|---|---|---|
| Mật khẩu | `bcryptjs` (thuần JS, không cần build native trên Windows) | ✅ |
| Xác thực | JWT access 15 phút + refresh 7 ngày, 2 secret riêng | ✅ |
| Phân quyền | RBAC `driver`/`owner`/`admin`, chống IDOR theo `owner` được phân công; đọc lại `role`/`is_active` từ DB mỗi request | ✅ |
| SQL Injection | Tham số hoá `$1, $2`, không nối chuỗi | ✅ |
| Header, CORS | `helmet`, `cors` whitelist `FRONTEND_URL` | ✅ |
| Brute force | `express-rate-limit` cho `/auth/login`; khoá check-in sau 5 lần sai mã | ✅ |
| Dò email | Thời gian phản hồi ổn định ở `/auth/login` khi email không tồn tại | ✅ |
| MQTT | Broker bắt buộc đăng nhập, ACL theo trạm | ✅ |
| HTTPS local | mkcert | 🕓 |

**Công cụ kiểm thử** (Phase 6, phục vụ báo cáo): OWASP ZAP (quét black-box), sqlmap (chứng minh đã vá SQLi), Burp Suite Community (sửa request tay), `npm audit` (đã chạy, kết quả ở `security/npm-audit/`), ESLint `eslint-plugin-security` hoặc Semgrep (white-box).

### 3.5 Frontend

| Thành phần | Công nghệ | Trạng thái |
|---|---|---|
| Khung | React 19 + Vite 8 (JavaScript) + `react-router-dom` | ✅ |
| Giao diện | Tailwind CSS v4 (`@tailwindcss/vite`, màu brand khai báo bằng `@theme` trong `src/index.css`), component tự viết | ✅ |
| Gọi API | `fetch` qua `src/api/client.js` (envelope chuẩn, tự refresh token) | ✅ |
| Bản đồ | `leaflet` + `react-leaflet`, tile OpenStreetMap | 🕓 |
| Biểu đồ | Chart.js | 🕓 |

### 3.6 GIS

| Thành phần | Công nghệ |
|---|---|
| Phần mềm | QGIS 3.44 LTR, kết nối trực tiếp PostGIS |
| Lập trình | PyQGIS (`gis/scripts/`) |
| Dữ liệu nền | OpenStreetMap qua QuickOSM hoặc Geofabrik (file `.pbf` để ở `gis/data/raw/`, không commit) |
| Định dạng trao đổi | GeoJSON, Shapefile |
| Hệ toạ độ | Lưu WGS84 (EPSG:4326); đo khoảng cách/buffer bằng UTM 48N (EPSG:32648) — phải nêu trong báo cáo |
| Phép phân tích | Buffer + vùng trống phủ sóng, nearest neighbor, đếm điểm trong vùng phục vụ |

API dùng `geography` của PostGIS để tính khoảng cách ra mét (`ST_DWithin`, toán tử `<->`), không tự reproject trong query.

### 3.7 Công cụ chung

Git + GitHub, Docker Compose, Postman/Thunder Client, VS Code, draw.io (sơ đồ UML/ERD cho báo cáo).

---

## 4. Lưu ý về dữ liệu

- Dữ liệu phiên sạc/đặt chỗ là **dữ liệu sinh giả có kiểm soát** — báo cáo phải ghi rõ nguồn và cách sinh.
- Bản đồ nền (đường, ranh giới) lấy từ OpenStreetMap — dữ liệu thật, công khai.
- Trạm sạc: tạo 5–15 điểm (hoặc lấy `amenity=charging_station` từ OSM) trong một khu vực nhỏ.
