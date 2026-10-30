# Tech stack: Hệ thống quản lý mạng lưới trạm sạc xe điện

Tài liệu này liệt kê công nghệ cần có cho dự án dùng chung 5 môn: IoT, Ngôn ngữ kịch bản, Web an toàn, GIS, Phân tích dữ liệu.

Chú thích mức độ: **[Bắt buộc]** cần có để đạt yêu cầu môn, **[Nên có]** tăng chất lượng, **[Tùy chọn]** làm nếu còn thời gian.

> **Cập nhật mô hình nghiệp vụ (2026-10-29):** bỏ marketplace (chủ trạm tự đăng ký), chuyển sang 1 công ty vận hành nhiều trạm — `admin` phân công `owner` quản lý. Không đổi công nghệ nền tảng, chỉ nâng WebSocket lên **[Bắt buộc]** (mục 2.2) và thêm hằng số đơn giá điện (mục 2.2b). Chi tiết nghiệp vụ: `docs/contracts.md`, `docs/FEATURES.md`.

---

## 1. Tổng quan theo tầng

| Tầng | Công nghệ chính | Môn phụ trách |
|---|---|---|
| Thiết bị | ESP32 (mô phỏng Wokwi), C/C++ | IoT |
| Truyền thông | MQTT (broker Mosquitto) | IoT |
| Backend | Node.js + Express, REST API | Ngôn ngữ kịch bản |
| Bảo mật | JWT, bcrypt, Helmet, OWASP | Web an toàn |
| Cơ sở dữ liệu | PostgreSQL + PostGIS | Dùng chung |
| Frontend | HTML/JS (hoặc React) + Leaflet | Web an toàn, GIS |
| GIS desktop | QGIS + PyQGIS | GIS |
| Phân tích | Python (Pandas, scikit-learn), Power BI | Phân tích dữ liệu |
| Công cụ chung | Git, Docker Compose, Postman | Cả nhóm |

---

## 2. Chi tiết từng tầng

### 2.1 IoT: thiết bị và truyền thông [Bắt buộc]

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Vi điều khiển | ESP32 | Mô phỏng một trạm sạc, mỗi trạm một ID |
| Mô phỏng | Wokwi | Không cần phần cứng thật; có thể thêm LED (trạng thái cổng), DHT22 (nhiệt độ) |
| Ngôn ngữ | C/C++ (Arduino framework) | Dùng Arduino IDE hoặc PlatformIO |
| Thư viện | `WiFi`, `PubSubClient`, `ArduinoJson`, `DHT sensor library` | Kết nối WiFi, publish MQTT, đóng gói JSON |
| Giao thức | MQTT | **Đã chốt 1 topic duy nhất**: `stations/{stationId}/status` — xem payload chính xác ở `docs/contracts.md` mục 1 |
| Broker | Eclipse Mosquitto (chạy bằng Docker) | Có thể dùng broker công cộng (HiveMQ) khi demo Wokwi |
| Công cụ kiểm tra | MQTT Explorer hoặc MQTTX | Xem message trực tiếp, hỗ trợ viết báo cáo |

Payload chuẩn, field, kiểu dữ liệu: xem **`docs/contracts.md`** (đây là bản chốt cuối, không lặp lại ở đây để tránh 2 nơi ghi khác nhau).

### 2.2 Backend [Bắt buộc]

| Thành phần | Công nghệ | Mục đích |
|---|---|---|
| Runtime | Node.js (bản LTS, đã chốt `24.x`) | Môn Ngôn ngữ kịch bản |
| Ngôn ngữ | **JavaScript (CommonJS)** (đổi lại từ TypeScript ngày 2026-10-27, theo yêu cầu môn Ngôn ngữ kịch bản) | Dev chạy bằng `node --watch`, không cần bước build |
| Framework | Express | Dựng REST API |
| MQTT client | `mqtt` | Backend đăng ký nhận dữ liệu từ broker |
| Truy cập CSDL | `pg` (node-postgres) | Dùng truy vấn tham số hóa, tránh SQL Injection |
| Migration | **`node-pg-migrate`** (đã chốt, không dùng file SQL thuần tay) | Quản lý lược đồ CSDL theo version, lệnh `npm run migrate:up`/`migrate:down` |
| Biến môi trường | `dotenv` | Không để mật khẩu trong mã nguồn |
| Tài liệu API | `swagger-ui-express` + OpenAPI | Tài liệu endpoint, dùng cho báo cáo |
| Kiểm thử | `jest` + `supertest` | Kiểm thử endpoint [Nên có] |
| Thời gian thực | `ws` hoặc `socket.io` | Đẩy trạng thái port/phiên sạc real-time lên giao diện — event `port:update`/`session:update` theo `docs/contracts.md` mục 1b **[Bắt buộc]** (nâng từ "Nên có" lên "Bắt buộc" 2026-10-29, mô hình nghiệp vụ mới yêu cầu real-time) |

Danh sách endpoint đầy đủ (method, body, response) đã chốt ở **`docs/contracts.md`** mục 4.

### 2.2b Thanh toán [Bắt buộc — đã chốt ở `docs/FEATURES.md` mục 3]

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Cổng thanh toán | VNPay **sandbox** | Không dùng tiền thật; cần tự đăng ký tài khoản sandbox tại `sandbox.vnpayment.vn` để lấy `VNPAY_TMN_CODE` + `VNPAY_HASH_SECRET` |
| Ký request/verify callback | `crypto` (built-in Node.js, HMAC-SHA512) | Không cần SDK bên thứ 3, tự viết helper `backend/src/services/vnpay.js` |
| Luồng | Pay sau khi phiên sạc kết thúc (không pay lúc đặt chỗ) | Chi tiết luồng + endpoint: `docs/contracts.md` mục 4, `docs/FEATURES.md` mục 3 |
| Đơn giá điện | Hằng số `UNIT_PRICE_PER_KWH` (biến môi trường, mặc định `3500` VNĐ/kWh) | Backend tự tính `cost = energy_kwh * UNIT_PRICE_PER_KWH` khi đóng phiên sạc *(thêm 2026-10-29, xem `docs/contracts.md` mục 1)* |

### 2.3 Bảo mật (môn Web an toàn) [Bắt buộc]

| Mục tiêu | Công nghệ / kỹ thuật |
|---|---|
| Mã hóa mật khẩu | `bcryptjs` (cùng thuật toán bcrypt, thuần JS — không cần build native trên Windows) |
| Xác thực | JWT (`jsonwebtoken`), access token ngắn hạn + refresh token |
| Phân quyền | RBAC 3 vai trò: tài xế, quản lý trạm (`owner`, do admin phân công — không tự tạo trạm), quản trị viên; kiểm tra quyền sở hữu tài nguyên để chống IDOR (`owner` chỉ thao tác trạm có `owner_id` là mình) |
| Chống SQL Injection | Truy vấn tham số hóa (`$1, $2`), không nối chuỗi |
| Chống XSS | Escape đầu ra, Content-Security-Policy (qua `helmet`) |
| Chống CSRF | Cookie `SameSite`, CSRF token nếu dùng cookie |
| Chống Timing Attack | So sánh thời gian ổn định ở `/auth/login` khi email không tồn tại — tránh lộ email có tồn tại hay không qua độ trễ phản hồi *(thêm 2026-10-29, mô hình nghiệp vụ mới)* |
| Kiểm tra đầu vào | **`zod`** (chốt ở Phase 4) — validate toàn bộ route nhận body qua `src/validation/` |
| Header bảo mật | `helmet` |
| Giới hạn tần suất | `express-rate-limit` (chống brute force `/auth/login`, chốt ở Phase 4) |
| CORS | `cors` cấu hình whitelist qua `FRONTEND_URL` |
| HTTPS | Chứng chỉ tự ký khi chạy local (mkcert) [Nên có] |
| Ghi log | **`pino`** (chốt ở Phase 4) — `pino-http` log mọi request, `src/services/audit.js` ghi riêng đăng nhập + thao tác nhạy cảm vào bảng `audit_logs` |

**Công cụ kiểm thử bảo mật** (phục vụ phần báo cáo):

| Công cụ | Dùng cho |
|---|---|
| OWASP ZAP | Quét lỗ hổng tự động (black-box) |
| Burp Suite Community | Chặn và sửa request thủ công |
| sqlmap | Thử tấn công SQL Injection để chứng minh đã vá |
| `npm audit` | Kiểm tra thư viện có lỗ hổng |
| ESLint + `eslint-plugin-security` hoặc Semgrep | Rà quét mã nguồn (white-box) |

### 2.4 Cơ sở dữ liệu [Bắt buộc]

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| CSDL chính | PostgreSQL | Lưu người dùng, trạm, đặt chỗ, phiên sạc |
| Không gian | PostGIS | Cột `geometry(Point, 4326)` cho vị trí trạm; hàm `ST_DWithin`, `ST_Distance`, `ST_Buffer` |
| Dữ liệu chuỗi thời gian | Bảng PostgreSQL có chỉ mục theo thời gian | TimescaleDB là tùy chọn, chưa cần thiết với quy mô này |
| Quản trị | pgAdmin hoặc DBeaver | Xem và truy vấn dữ liệu |

Bảng đã migrate thật (Phase 1 + bổ sung thanh toán): `users`, `stations` (có `geom`), `ports`, `bookings`, `charging_sessions`, `telemetry`, `audit_logs`, `payments`.

### 2.5 Frontend [Bắt buộc]

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Giao diện |  React + Vite |
| Bản đồ web | Leaflet + OpenStreetMap tile | Hiển thị trạm, lớp trạng thái, tìm trạm gần |
| Biểu đồ | Chart.js | Doanh thu, công suất theo thời gian |
| HTTP client | `fetch` hoặc `axios` | Gọi REST API |
| Giao diện đẹp | Tailwind CSS hoặc Bootstrap [Tùy chọn] | Không cần thiết kế cầu kỳ |

### 2.6 GIS (môn Hệ thống thông tin không gian) [Bắt buộc]

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Phần mềm GIS | **QGIS 3.44 LTR** | Kết nối trực tiếp PostGIS. **Không dùng QGIS 4.x** — bản 4.2.2 gặp access violation khi chạy QuickOSM (`addMapLayer`, lỗi tương thích Qt6, xem `gis/` ghi chú 2026-10-20), 3.44 LTR ổn định và được QuickOSM hỗ trợ tốt hơn |
| Lập trình | PyQGIS (Python) | Viết script hoặc plugin nhỏ phân tích vùng phục vụ |
| Dữ liệu nền | OpenStreetMap (đường, ranh giới hành chính) | Tải bằng QuickOSM hoặc Geofabrik |
| Định dạng trao đổi | GeoJSON, Shapefile | Xuất, nhập dữ liệu để minh họa chuẩn hóa dữ liệu |
| Hệ tọa độ | WGS84 (EPSG:4326) lưu trữ; VN-2000 hoặc UTM 48N (EPSG:32648) khi đo khoảng cách | Cần nêu rõ trong báo cáo |
| Phép phân tích | Buffer (vùng phục vụ), nearest neighbor, đếm điểm trong vùng, tìm khoảng trống phủ sóng | Ít nhất một phép phân tích thật sự |

### 2.7 Phân tích dữ liệu (môn Phân tích và trực quan hóa dữ liệu) [Bắt buộc]

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Ngôn ngữ | Python | Chạy trong Jupyter Notebook |
| Xử lý dữ liệu | Pandas, NumPy | Làm sạch, xử lý dữ liệu thiếu, tổng hợp |
| Khai phá dữ liệu | scikit-learn (K-Means, Decision Tree, Linear Regression), `mlxtend` (Apriori, FP-Growth) | Đúng theo đề cương môn |
| Đánh giá | R², MSE, silhouette score | Báo cáo kết quả mô hình |
| Vẽ biểu đồ | Matplotlib, Seaborn, Plotly | Biểu đồ trong notebook |
| Dashboard | Power BI Desktop | KPI: doanh thu, tỷ lệ sử dụng trạm, giờ cao điểm |
| Kết nối dữ liệu | Power BI đọc từ PostgreSQL hoặc file CSV xuất ra | Chọn một cách, ghi rõ trong báo cáo |
| Sinh dữ liệu giả | Python (`Faker`, `numpy.random`) | Tạo dữ liệu phiên sạc có kiểm soát (xem mục 4) |

### 2.8 Công cụ chung [Bắt buộc]

| Công cụ | Mục đích |
|---|---|
| Git + GitHub | Quản lý mã nguồn, chia nhánh theo từng mảng |
| Docker + Docker Compose | Chạy PostgreSQL/PostGIS, Mosquitto, backend chung một lệnh |
| Postman hoặc Thunder Client | Kiểm thử API |
| VS Code | Môi trường lập trình |
| Draw.io hoặc Mermaid | Vẽ sơ đồ kiến trúc, ERD cho báo cáo |

---

## 3. Cấu trúc thư mục gợi ý

```
ev-charging-network/
├── docker-compose.yml        # postgres+postgis, mosquitto, backend
├── iot/                      # code ESP32 + file Wokwi (diagram.json)
├── backend/                  # Node.js + Express
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/       # auth, rbac, validate
│   │   ├── services/         # mqtt subscriber, nghiệp vụ
│   │   └── db/
│   └── tests/
├── frontend/                 # giao diện web + Leaflet
├── gis/                      # dự án QGIS, PyQGIS scripts, dữ liệu OSM
├── analytics/                # notebooks, script sinh dữ liệu, file .pbix
├── security/                 # báo cáo ZAP, kịch bản tấn công thử
└── docs/                     # sơ đồ, báo cáo từng môn
```

---

## 4. Lưu ý về dữ liệu

- Dữ liệu phiên sạc và đặt chỗ sẽ được **sinh giả có kiểm soát** (giờ cao điểm, phân bố theo khu vực, nhiễu ngẫu nhiên). Báo cáo của mỗi môn cần ghi rõ nguồn và cách sinh dữ liệu để đảm bảo trung thực.
- Dữ liệu nền bản đồ (đường, ranh giới) lấy từ OpenStreetMap, là dữ liệu thật và công khai.
- Dữ liệu trạm sạc có thể tạo thủ công 5–15 điểm trong một khu vực nhỏ (một thành phố hoặc quận).

---

## 5. Phân công gợi ý cho nhóm

| Mảng | Công nghệ trọng tâm | Môn |
|---|---|---|
| IoT | ESP32, Wokwi, MQTT, Mosquitto | IoT |
| Backend và bảo mật | Node.js, Express, JWT, OWASP, ZAP | Ngôn ngữ kịch bản, Web an toàn |
| Dữ liệu không gian | PostgreSQL, PostGIS, QGIS, PyQGIS, Leaflet | GIS |
| Phân tích | Python, Pandas, scikit-learn, Power BI | Phân tích dữ liệu |

Hai thứ cả nhóm cần chốt sớm: **lược đồ CSDL** và **tài liệu API**. Sau khi chốt, các mảng có thể làm gần như độc lập.

---

## 6. Thứ tự cài đặt đề xuất

1. Cài Git, Docker, Node.js, VS Code.
2. Dựng `docker-compose.yml` với PostgreSQL/PostGIS và Mosquitto.
3. Tạo lược đồ CSDL và nạp dữ liệu trạm mẫu.
4. Dựng backend tối thiểu (đăng nhập + danh sách trạm).
5. Dựng mạch ESP32 trên Wokwi gửi dữ liệu lên MQTT.
6. Hoàn thiện frontend, bản đồ, rồi QGIS và phân tích.
7. Cuối cùng: kiểm thử bảo mật và viết báo cáo từng môn.
