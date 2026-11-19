# Roadmap & tiến độ — SacDau

Danh sách việc chung của cả nhóm. Xong việc nào thì tick `[x]` ngay trong PR làm việc đó; xong 1 mốc lớn thì thêm 1 dòng vào "Mốc đã qua" ở cuối. Chi tiết kỹ thuật không ghi ở đây — trỏ sang `contracts.md` / `LUONG_NGHIEP_VU.md`.

Cập nhật: 2026-11-19.

## Tổng quan

| Mảng | Phụ trách | Trạng thái |
|---|---|---|
| Hạ tầng (Docker, Postgres/PostGIS, Mosquitto có xác thực) | Người 2 | ✅ Xong |
| Backend API + luồng nghiệp vụ | Người 2 | ✅ Xong, `npm test` 134/134. Code Phase 5b đang ở nhánh `Viet`, **chưa vào `main`** |
| IoT (firmware ESP32/Wokwi) | Người 1 | ✅ Chạy thật với server qua Wokwi VS Code — cần Người 1 xem lại |
| Frontend | chưa chốt | 🟡 Có khung, landing, đăng nhập/đăng ký; các trang chức năng còn là placeholder |
| GIS | Người 3 | ⬜ Chưa bắt đầu phần phân tích (API tìm trạm gần đã có) |
| Kiểm thử bảo mật (Web an toàn) | Người 2 | ⬜ Chưa bắt đầu (chỉ có `npm audit`) |

## Cần cả nhóm chốt

- [ ] **Ai làm frontend** cho 3 vai trò bên dưới — đặc biệt màn hình **quản lý trạm**: thiếu nó thì luồng check-in không demo được trên giao diện.
- [ ] Người 1 xem lại `iot/sketch.ino` (đã được sửa để khớp luồng mới, xem mục IoT).
- [ ] Sau khi Phase 5b vào `main`: nhánh `Phi`, `Huan` rebase lên `main` và đọc `LUONG_NGHIEP_VU.md` + `contracts.md` (nhiều hành vi đã đổi).

---

## Backend — Người 2

Đã xong (chi tiết hành vi ở `LUONG_NGHIEP_VU.md`, endpoint ở `contracts.md`):

- [x] Khung Express, migration `node-pg-migrate`, `/health`
- [x] Auth: register (chỉ `driver`), login, refresh; RBAC 3 vai trò; chống IDOR; admin tạo `owner`, khoá/mở tài khoản (có hiệu lực ngay)
- [x] Bảo mật nền: helmet, CORS whitelist, rate-limit login, zod, pino + audit log, chống dò email
- [x] Trạm/cổng: CRUD admin, ngừng hoạt động (soft), phân công quản lý, bảo trì cổng, tìm trạm gần (PostGIS)
- [x] Đặt chỗ + cọc VNPay + check-in bằng mã (khoá sau 5 lần sai, đổi cổng, gắn phiên)
- [x] Engine phiên sạc từ MQTT (`sessionEngine.js`): phiên trái phép, phí chiếm chỗ, chống phiên ma/điện năng vô lý, giữ điện năng khi thiết bị khởi động lại
- [x] Job định kỳ: hết hạn cọc, no-show, watchdog offline
- [x] Thanh toán VNPay sandbox: trừ cọc, IPN so số tiền, giao dịch trùng → cần hoàn, admin xác nhận đã hoàn
- [x] Sự cố, báo cáo doanh thu/sử dụng theo phạm vi owner
- [x] WebSocket có xác thực (`port:update` công khai; `session:update`, `alert` theo quyền)
- [x] Mosquitto bắt buộc đăng nhập + ACL theo trạm
- [x] Script `create-admin`, `e2e:demo` (chạy thử toàn luồng rồi tự dọn)

Còn lại:

- [ ] (Nên có) Đối soát `querydr` với VNPay trong job hết hạn cọc — lưới an toàn khi IPN không tới
- [ ] (Nên có) Swagger/OpenAPI (`swagger-ui-express`) cho báo cáo
- [ ] Demo VNPay thật qua tunnel (cách làm ở `README.md`)

## IoT — Người 1

`iot/sketch.ino`, mạch `iot/diagram.json`. Đã chạy thật mạch ↔ server: cắm khi chưa check-in → phiên trái phép; giữ nút 2 giây / quá nhiệt → `fault`, đóng phiên, mở sự cố; hết nóng → `idle`.

- [x] Đăng nhập broker bằng tài khoản trạm; bật/tắt TLS bằng `MQTT_USE_TLS` (TLS đang `setInsecure()`, đủ cho demo)
- [x] Cấu hình bí mật tách ra `iot/secrets.h` (gitignore), mẫu `iot/secrets.example.h`
- [x] Publish ngay khi đổi trạng thái + heartbeat 5 giây; giữ bản tin khi mất kết nối
- [x] Chống dội nút (30 ms); giữ `charging` khi pin đầy, chỉ gửi `idle` khi rút súng
- [x] `timestamp: null` khi chưa đồng bộ NTP; `energyKwh` chỉ tăng trong 1 phiên
- [x] Tự kết nối lại WiFi/MQTT không chặn vòng lặp
- [ ] Người 1 xem lại và xác nhận
- [ ] (Tuỳ chọn) Biến trở thứ 2 để giả lập riêng từng cổng đầy pin
- [ ] (Tuỳ chọn) Chạy trên wokwi.com với broker cloud có TLS (EMQX Cloud Serverless) — chưa thử, xem `mosquitto/README.md`

## Frontend — chưa chốt người làm

Đã có: React + Vite + Tailwind, router theo vai trò, API client (tự refresh token), landing page, đăng nhập/đăng ký. Các trang `/driver-dashboard`, `/station-dashboard`, `/stations`, `/bookings`, `/reports` còn là placeholder.

- [ ] **Tài xế:** bản đồ trạm (Leaflet — xem mục GIS), chi tiết trạm + cổng real-time, đặt chỗ / đặt ngay → chuyển VNPay + đếm ngược 5 phút, danh sách booking + mã check-in, phiên đang sạc real-time + cảnh báo phí chiếm chỗ, trả phần còn lại, trang `/payment-result`
- [ ] **Quản lý trạm:** booking hôm nay + nhập mã check-in (đổi cổng, gắn phiên), cảnh báo (phiên trái phép, xe đầy, sự cố), đóng tay phiên, bảo trì cổng, danh sách sự cố
- [ ] **Admin:** tạo/khoá tài khoản nhân viên, quản lý trạm + phân công, danh sách cần hoàn, báo cáo (Chart.js). Hiện admin đăng nhập xong được đưa tạm về `/reports`
- [ ] ESLint + Prettier (dùng chung config cho `frontend/` và `backend/`)

## GIS — Người 3

Hiện trạng: bảng `stations` có cột `geom GEOMETRY(Point, 4326)` + index GIST; `GET /stations?near=lat,lng&radiusKm=` đã lọc theo bán kính và sắp xếp theo khoảng cách (dùng `geography`, ra mét). `gis/data/`, `gis/scripts/` còn trống.

**G0 — Dữ liệu** (làm trước)
- [ ] Chọn khu vực nghiên cứu (1 quận/thành phố)
- [ ] Tải ranh giới hành chính + đường từ OSM (QuickOSM hoặc Geofabrik) vào `gis/data/` (file `.pbf` thô để ở `gis/data/raw/`, không commit)
- [ ] Điểm trạm: lấy `amenity=charging_station` từ OSM, hoặc tự rải 30–60 điểm giả lập (ghi rõ trong báo cáo)
- [ ] Nạp trạm vào DB qua API `POST /stations` (admin) hoặc script seed — **cần `code` duy nhất cho mỗi trạm**; export lại đúng tập đó ra `gis/data/stations.geojson` để báo cáo khớp demo

**G1 — Phân tích QGIS + PyQGIS** (lõi môn GIS)
- [ ] QGIS 3.44 LTR kết nối thẳng PostGIS (layer `stations` từ DB, không export tay)
- [ ] Reproject sang **EPSG:32648** trước khi đo/buffer (4326 là độ, buffer "mét" trên 4326 sẽ sai)
- [ ] Phép 1: buffer vùng phục vụ (vd 2 km) → dissolve → lấy ranh giới trừ vùng phủ = **vùng trống**, tính diện tích km²
- [ ] Phép 2: nearest neighbor từ tập điểm mẫu (dân cư/centroid) tới trạm gần nhất (`native:joinbynearest`)
- [ ] Phép 3: đếm điểm dân cư/POI trong mỗi vùng phục vụ (`native:countpointsinpolygon`)
- [ ] Gộp 3 phép thành 1 script chạy lại được: `gis/scripts/analysis.py`; lưu project `.qgz`, bản đồ PNG, kết quả GeoJSON vào `gis/`

**G2 — Bản đồ web** (trong `frontend/src/pages/StationsPage.jsx`)
- [ ] Cài `leaflet` + `react-leaflet` (version cứng)
- [ ] Marker trạm từ `GET /stations`, màu theo trạng thái cổng, cập nhật qua WebSocket `port:update`
- [ ] Lọc theo trạng thái + khoảng cách (`?near=`, vị trí từ `navigator.geolocation`)
- [ ] (Tuỳ chọn) Overlay GeoJSON vùng trống từ G1

**G3 — Báo cáo môn GIS:** nguồn dữ liệu, hệ toạ độ từng bước (và vì sao phải đổi), 3 phép phân tích + bản đồ + số liệu + nhận xét, kèm script và hướng dẫn chạy lại.

## Kiểm thử bảo mật — Người 2 (môn Web an toàn)

- [ ] OWASP ZAP quét toàn bộ API → `security/zap-report/`
- [ ] Case study SQL Injection: 1 endpoint thử nghiệm cố ý lỗi, chứng minh bằng `sqlmap`, vá bằng tham số hoá
- [ ] Rà mã nguồn bằng `eslint-plugin-security` hoặc Semgrep, sửa cảnh báo quan trọng
- [ ] Cập nhật `npm audit` (lần trước: 2026-10-14, backend còn 22 cảnh báo ở dev dependency — `security/npm-audit/README.md`)
- [ ] Báo cáo tổng hợp lỗ hổng đã tìm + cách vá

---

## Mốc đã qua

- 2026-10-12 — Khởi tạo repo, Docker (Postgres+PostGIS cổng `5433`, Mosquitto), migration đầu tiên, chốt contract và phạm vi tính năng (giữ VNPay sandbox).
- 2026-10-13 — Auth & RBAC (JWT, chống IDOR, test jest+supertest). Khung frontend React + Vite + Tailwind. Tạo nhánh `Viet`/`Phi`/`Huan`.
- 2026-10-14 — Landing page; route dashboard theo vai trò. Bảo mật nền: rate-limit, zod, pino + audit log, `npm audit`.
- 2026-10-27 — Backend đổi TypeScript → JavaScript CommonJS (yêu cầu môn Ngôn ngữ kịch bản).
- 2026-10-29 — Đổi mô hình: 1 công ty nhiều trạm, admin phân công quản lý (bỏ marketplace).
- 2026-10-30 — Route nghiệp vụ, MQTT subscriber, WebSocket, VNPay sandbox thật (sửa IPN sang GET). PR #8 vào `main`.
- 2026-11-18 — Phase 5b "luồng nghiệp vụ thực tế": cọc khi đặt, check-in bằng mã, phiên trái phép, phí chiếm chỗ, chỉ VNPay, broker có xác thực + ACL. Bỏ môn Phân tích dữ liệu. Thêm `LUONG_NGHIEP_VU.md`.
- 2026-11-19 — Firmware ESP32 khớp luồng mới, chạy thật với server qua Wokwi VS Code (`host.wokwi.internal`). Gọn lại tài liệu nhóm (gộp `ROADMAP_GIS.md` vào file này).
