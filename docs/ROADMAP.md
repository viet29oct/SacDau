# Roadmap & tiến độ — SacDau

Danh sách việc chung của cả nhóm. Xong việc nào thì tick `[x]` ngay trong PR làm việc đó; xong 1 mốc lớn thì thêm 1 dòng vào "Mốc đã qua" ở cuối. Chi tiết kỹ thuật không ghi ở đây — trỏ sang `contracts.md` / `LUONG_NGHIEP_VU.md`.

Cập nhật: 2026-11-23.

## Tổng quan

| Mảng | Phụ trách | Trạng thái |
|---|---|---|
| Hạ tầng (Docker, Postgres/PostGIS, Mosquitto có xác thực) | Người 1 (Việt) | ✅ Xong |
| Backend API + luồng nghiệp vụ | Người 1 (Việt) | ✅ Xong, `npm test` 134/134. Phase 5b đã vào `main` (PR #9, 2026-11-19) |
| IoT (firmware ESP32/Wokwi) | Người 2 (Phi) | ✅ Chạy thật với server qua Wokwi VS Code — cần Người 2 xem lại |
| Frontend | chưa chốt | 🟡 Có khung, landing, đăng nhập/đăng ký; các trang chức năng còn là placeholder |
| GIS | Người 3 (Huấn) + nhóm 6 HTTTKG, phân công ở [`gis/PHAN_CONG.md`](../gis/PHAN_CONG.md) | 🟡 Chọn chủ đề 35, có khung plugin chạy được trên dữ liệu của môn; chưa có bản đồ web |
| Kiểm thử bảo mật (Web an toàn) | Người 1 (Việt) | ⬜ Chưa bắt đầu (chỉ có `npm audit`) |

## Cần cả nhóm chốt

- [ ] **Ai làm frontend** cho 3 vai trò bên dưới — đặc biệt màn hình **quản lý trạm**: thiếu nó thì luồng check-in không demo được trên giao diện.
- [ ] Người 2 xem lại `iot/sketch.ino` (đã được sửa để khớp luồng mới, xem mục IoT).
- [ ] Phi, Huấn lấy code mới về nhánh `Phi`, `Huan` (đang chậm `main` 43 commit, gồm cả Phase 5b): `git merge origin/main` theo `AGENTS.md` mục 2, rồi đọc lại `LUONG_NGHIEP_VU.md` + `contracts.md` (nhiều hành vi đã đổi).

---

## Backend — Người 1 (Việt)

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

## IoT — Người 2 (Phi)

`iot/sketch.ino`, mạch `iot/diagram.json`. Đã chạy thật mạch ↔ server: cắm khi chưa check-in → phiên trái phép; giữ nút 2 giây / quá nhiệt → `fault`, đóng phiên, mở sự cố; hết nóng → `idle`.

- [x] Đăng nhập broker bằng tài khoản trạm; bật/tắt TLS bằng `MQTT_USE_TLS` (TLS đang `setInsecure()`, đủ cho demo)
- [x] Cấu hình bí mật tách ra `iot/secrets.h` (gitignore), mẫu `iot/secrets.example.h`
- [x] Publish ngay khi đổi trạng thái + heartbeat 5 giây; giữ bản tin khi mất kết nối
- [x] Chống dội nút (30 ms); giữ `charging` khi pin đầy, chỉ gửi `idle` khi rút súng
- [x] `timestamp: null` khi chưa đồng bộ NTP; `energyKwh` chỉ tăng trong 1 phiên
- [x] Tự kết nối lại WiFi/MQTT không chặn vòng lặp
- [ ] Người 2 xem lại và xác nhận
- [ ] (Tuỳ chọn) Biến trở thứ 2 để giả lập riêng từng cổng đầy pin
- [ ] (Tuỳ chọn) Chạy trên wokwi.com với broker cloud có TLS (EMQX Cloud Serverless) — chưa thử, xem `mosquitto/README.md`

## Frontend — chưa chốt người làm

Đã có: React + Vite + Tailwind, router theo vai trò, API client (tự refresh token), landing page, đăng nhập/đăng ký. Các trang `/driver-dashboard`, `/station-dashboard`, `/stations`, `/bookings`, `/reports` còn là placeholder.

- [ ] **Tài xế:** bản đồ trạm (Leaflet — xem mục GIS), chi tiết trạm + cổng real-time, đặt chỗ / đặt ngay → chuyển VNPay + đếm ngược 5 phút, danh sách booking + mã check-in, phiên đang sạc real-time + cảnh báo phí chiếm chỗ, trả phần còn lại, trang `/payment-result`
- [ ] **Quản lý trạm:** booking hôm nay + nhập mã check-in (đổi cổng, gắn phiên), cảnh báo (phiên trái phép, xe đầy, sự cố), đóng tay phiên, bảo trì cổng, danh sách sự cố
- [ ] **Admin:** tạo/khoá tài khoản nhân viên, quản lý trạm + phân công, danh sách cần hoàn, báo cáo (Chart.js). Hiện admin đăng nhập xong được đưa tạm về `/reports`
- [ ] ESLint + Prettier (dùng chung config cho `frontend/` và `backend/`)

## GIS — Người 3 (Huấn) + nhóm 6 môn HTTTKG

Môn HTTTKG (D18CNPM1) chấm **một plugin QGIS** theo một trong 40 chủ đề của giáo viên, chạy trên **bộ dữ liệu Bắc Ninh của môn**. Plugin, hướng dẫn và báo cáo chiếm 40% điểm thi, slide và trình bày chiếm 60%. Nhóm 6 có 6 người, gồm 3 người SacDau và 3 bạn chỉ làm trong `gis/`. Nhóm chọn **chủ đề 35**: Processing Plugin xác định vùng phục vụ và số khách hàng dễ tiếp cận dịch vụ ngành điện. Trạm sạc SacDau là phần mở rộng. Ai làm việc nào: [`gis/PHAN_CONG.md`](../gis/PHAN_CONG.md), tên ghi cuối mỗi việc bên dưới. Dữ liệu, cách cài và chạy plugin: [`gis/README.md`](../gis/README.md).

Hiện trạng:
- Khung plugin `gis/sacdau_service_area/` chạy được, đã thử trên dữ liệu của môn: 12 đơn vị điện lực, bán kính 3 km, phục vụ 221/665 làng; 46 trạm sạc phục vụ 420/665 làng.
- 46 trạm sạc OSM nằm ở `gis/data/stations_osm.geojson`.
- API `GET /stations?near=` (PostGIS) đã có.

**G0 — Chủ đề và dữ liệu**
- [x] Chọn chủ đề 35 (dự phòng: 21, tách điểm theo khoảng cách tới QL1/QL18)
- [x] Ghi `35` vào ô chủ đề của nhóm 6 trên bảng đăng ký của lớp (ô K3) — Việt
- [ ] Hỏi giáo viên: dùng SacDau làm phần mở rộng/ứng dụng có được không — Huấn
- [x] Vùng nghiên cứu: Bắc Ninh cũ (`KhuVucNghienCuu.shp` của môn). Bỏ việc tự tải ranh giới/đường từ OSM
- [x] Trạm sạc: 46 điểm `amenity=charging_station` từ OSM trong vùng nghiên cứu, mã `BN001`…`BN046` (truy vấn 2026-11-23)
- [ ] Nạp 46 trạm vào DB SacDau qua `POST /stations` (admin), lấy `code` từ file, số cổng gán mặc định vì OSM không có — Việt

**G1 — Plugin chủ đề 35** (`gis/sacdau_service_area/`)
- [x] Khung plugin: provider Processing `SacDau`, nút trên toolbar/menu, thuật toán `sacdau:service_area`
- [x] Tham số theo đề: lớp đơn vị và chọn 1/nhiều đơn vị (*Selected features only* hoặc biểu thức lọc), lớp khách hàng, bán kính, nơi lưu kết quả
- [x] Kết quả: vùng phục vụ kèm số khách hàng, khách hàng được/chưa được phục vụ, vùng trống (km²) trong khu vực nghiên cứu
- [ ] Style `.qml` cho 4 lớp kết quả, tự áp khi nạp vào project (dựa theo style trong `SanPhamMau/Style` của môn) — Dương
- [ ] Bảng tổng hợp theo đơn vị (đơn vị, số KH, tỉ lệ) xuất CSV để đưa vào báo cáo — Phi
- [ ] (Nên có) Gán dân số xã (`DanSoPXa2025`) cho từng làng để dùng làm trọng số, ra "số dân được phục vụ" thay vì chỉ số làng — Phong
- [ ] Nén `.zip` và cài thử trên một máy chưa có repo (QGIS 3.44 LTR) — Tiệp

**G2 — Mở rộng với SacDau**
- [ ] Chạy plugin với lớp trạm sạc đọc thẳng từ PostGIS của SacDau (*Layer → Add PostGIS*), ngoài file GeoJSON — Việt
- [ ] Xuất vùng trống ra `gis/data/` (GeoJSON, EPSG:4326) cho bản đồ web — Huấn
- [ ] Bản đồ web trong `frontend/src/pages/StationsPage.jsx`: cài `leaflet` + `react-leaflet` (version cứng), marker trạm từ `GET /stations` tô màu theo trạng thái cổng (WebSocket `port:update`), lọc theo khoảng cách (`?near=`), overlay vùng trống, ghi nguồn © OpenStreetMap — Huấn

**G3 — Nộp bài và thi**
- [ ] Một file gồm hướng dẫn cài đặt/sử dụng và báo cáo: phân tích yêu cầu, giao diện, dữ liệu, giải thuật, hệ toạ độ (dữ liệu môn ở EPSG:32648, trạm sạc ở 4326, đo trên hệ phẳng), phân công 6 người — mỗi người viết phần của mình, Tiệp gộp file
- [ ] Slide và kịch bản demo khoảng 10 phút. (1) Chạy đúng đề trên đơn vị điện lực. (2) Mở rộng với trạm sạc: vùng phủ, vùng trống, làng chưa có trạm. (3) Nếu G2 xong: tạo trạm mới trên SacDau ngay trong vùng trống, chạy lại plugin. Phần SacDau chỉ chiếm 1–2 slide, không trình bày đặt chỗ/VNPay/IoT — Dương gộp slide, Phi viết kịch bản demo

## Kiểm thử bảo mật — Người 1 (Việt, môn Web an toàn)

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
- 2026-11-23 — GIS: chọn chủ đề 35 môn HTTTKG (plugin vùng phục vụ, dùng bộ dữ liệu Bắc Ninh của môn), bỏ hướng tự chọn khu vực. Lấy 46 trạm sạc OSM trong Bắc Ninh cũ. Dựng khung Processing Plugin.
