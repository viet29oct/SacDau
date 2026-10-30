# Roadmap — Môn GIS (Hệ thống thông tin không gian)

File này là kế hoạch triển khai riêng cho phần **GIS** của dự án SacDau, cùng cấu trúc phase + checkbox như `docs/ROADMAP.md` (của Người 2) để dễ theo dõi tiến độ và ghi nhật ký.

Theo `docs/QUY_TAC_LAM_VIEC_NHOM.md` mục 2, phần này thuộc **Người 3** (thư mục sở hữu: `backend/src/routes/stations.js`, `gis/`, `frontend/src/` phần bản đồ). Hiện tại (2026-10-20) nhánh `Phi`/`Huan` vẫn ở commit cũ, chưa có ai bắt đầu phần này — file này viết sẵn để bàn giao hoặc tự làm backstop nếu cần.

Tham chiếu bắt buộc đọc trước: `docs/TECH_STACK.md` mục 2.6 (công nghệ GIS đã chốt), `docs/FEATURES.md` mục 2 (3 phép phân tích GIS phải có), `docs/contracts.md` mục 3 (object `Station`, field `location.lat/lng` map từ cột `geom`).

---

## Hiện trạng (2026-10-20)

- Bảng `stations` đã migrate xong: cột `geom GEOMETRY(Point, 4326) NOT NULL` + index `GIST` (`backend/migrations/1791819717249_init.js`). **Chưa có dữ liệu** — bảng rỗng.
- `backend/src/routes/stations.js` — **chưa tồn tại**.
- `gis/data/` và `gis/scripts/` — chỉ có `.gitkeep`, chưa có gì.
- `frontend/src/pages/StationsPage.jsx` — trang placeholder, chưa có bản đồ.
- Quyết định CRS đã chốt ở `TECH_STACK.md` mục 2.6: lưu trữ **WGS84 (EPSG:4326)**, đo khoảng cách/buffer thật dùng **UTM 48N (EPSG:32648)** hoặc VN-2000 — bắt buộc nêu rõ trong báo cáo vì 4326 là độ, không phải mét.

---

## Phase G0 — Dữ liệu nền (làm trước, quyết định mọi phase sau)

Không có dữ liệu thì không phân tích được gì — làm trước tiên.

- [ ] Chọn khu vực nghiên cứu cụ thể (gợi ý: 1 quận/thành phố, ví dụ Hà Nội nội thành hoặc TP.HCM — đủ nhỏ để OSM tải nhanh, đủ lớn để phân tích "khoảng trống phủ sóng" có ý nghĩa).
- [ ] Tải ranh giới hành chính + mạng lưới đường của khu vực từ OpenStreetMap bằng **QuickOSM** (plugin QGIS) hoặc **Geofabrik** (extract theo vùng) — lưu vào `gis/data/` dạng GeoJSON/Shapefile. Đây là **dữ liệu thật công khai**, có thể ghi rõ nguồn trong báo cáo.
- [ ] Lấy dữ liệu **trạm sạc mẫu** để nạp vào bảng `stations`. Hai hướng, chọn 1 hoặc kết hợp:
  - (a) Dùng OSM thật: tag `amenity=charging_station` trong khu vực đã chọn (qua QuickOSM/Overpass) — thực tế, dễ bảo vệ trong báo cáo vì là dữ liệu có thật.
  - (b) Tự tạo điểm giả lập (30–60 điểm) rải trong khu vực để đảm bảo đủ mật độ cho phân tích buffer/gap — ghi rõ trong báo cáo là dữ liệu mô phỏng để minh hoạ phương pháp.
- [ ] Viết script seed (`backend/src/scripts/seedStations.js` hoặc SQL insert tay) nạp dữ liệu đã chọn vào bảng `stations` thật (field `name`, `geom` dạng `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`, số cổng ở bảng `ports`) — để backend và frontend có dữ liệu thật để hiển thị, không chỉ làm trong QGIS riêng.
- [ ] Export đúng tập điểm trạm đã nạp DB ra GeoJSON (khớp dữ liệu giữa DB và QGIS, tránh lệch số liệu giữa báo cáo và demo web) — lưu `gis/data/stations.geojson`.

**Giao nộp phase này:** `gis/data/` có ranh giới khu vực + đường + điểm trạm (GeoJSON/Shapefile), bảng `stations` trong Postgres có dữ liệu thật khớp với file export.

---

## Phase G1 — Backend: route `/stations` (truy vấn không gian qua API)

Thuộc sở hữu `backend/src/routes/stations.js` — dùng PostGIS, không tính toán khoảng cách bằng JS.

- [ ] `GET /stations` — trả toàn bộ trạm, map `geom` → `{lat, lng}` qua `ST_X(geom)`/`ST_Y(geom)` đúng theo `contracts.md` mục 3.
- [ ] `GET /stations?near=lat,lng&radiusKm=` — dùng `ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($lng,$lat),4326)::geography, radiusMet)`. Cast sang `geography` để PostGIS tự tính khoảng cách mặt cầu ra **mét**, không cần tự reproject trong query API (khác với phần phân tích QGIS ở Phase G2, nơi vẫn cần reproject UTM để làm đúng quy trình GIS thủ công cho báo cáo).
- [ ] `GET /stations/:id/nearest?lat=&lng=` (hoặc gộp vào query trên bằng `ORDER BY geom::geography <-> point::geography LIMIT 1`) — phép **nearest neighbor** phục vụ tính năng "tìm trạm gần nhất" cho tài xế (đường chim bay, đã chốt không routing thật ở `FEATURES.md` mục 4).
- [ ] `POST /stations` (owner/admin), `PATCH /stations/:id` (owner/admin) — nhận `{name, lat, lng}`, build `geom` bằng `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`. Nhớ dùng `assertOwnerOrAdmin` (helper có sẵn của Người 2, `backend/src/utils` hoặc tương đương) để chống IDOR, không viết lại logic quyền từ đầu.
- [ ] Toàn bộ query dùng tham số hoá (`$1, $2`) — không nối chuỗi SQL (áp dụng chuẩn Phase 4 bảo mật đã có cho `auth`/`users`).
- [ ] Test `jest` + `supertest` tối thiểu: tạo trạm, lấy danh sách, query `near` trả đúng trạm trong bán kính và loại trạm ngoài bán kính.

**Giao nộp phase này:** `/stations` hoạt động thật trên dữ liệu đã seed ở G0, có test, đúng contract.

---

## Phase G2 — Phân tích không gian thật (QGIS + PyQGIS) — phần lõi môn GIS

Đây là phần **bắt buộc chứng minh kỹ thuật** cho báo cáo, theo đúng 3 phép đã chốt ở `FEATURES.md` mục 2: buffer+gap, nearest neighbor, đếm điểm trong vùng.

- [ ] Mở QGIS (bản LTR), kết nối trực tiếp PostGIS (layer `stations` từ DB, không export tay) — chứng minh pipeline Postgres→QGIS thật, không phải làm tách rời bằng file tĩnh.
- [ ] **Reproject** layer trạm + ranh giới khu vực từ EPSG:4326 sang **EPSG:32648 (UTM 48N)** trước khi đo khoảng cách/buffer — bắt buộc, vì 4326 là độ kinh/vĩ, buffer ra "mét" trên 4326 sẽ sai hoàn toàn. Ghi rõ bước này + lý do trong báo cáo (khớp lưu ý ở `TECH_STACK.md` mục 2.6).
- [ ] **Phép 1 — Buffer vùng phục vụ + gap analysis**: tạo buffer bán kính cố định (ví dụ 2km, ghi rõ giả định) quanh mỗi trạm bằng PyQGIS (`processing.run("native:buffer", ...)`), hợp nhất (`dissolve`) các buffer, rồi lấy phần ranh giới khu vực **trừ** union buffer (`difference`) → ra vùng chưa được phủ sóng. Xuất bản đồ + diện tích vùng trống (km²).
- [ ] **Phép 2 — Nearest neighbor**: viết script PyQGIS hoặc dùng thuật toán có sẵn (`qgis:distancetonearesthub` / `native:joinbynearest`) tính khoảng cách từ 1 tập điểm mẫu (ví dụ điểm dân cư giả lập hoặc centroid các khu vực) tới trạm gần nhất — minh hoạ đúng tính năng "tìm trạm gần nhất" ở Phase G1 nhưng bằng công cụ GIS chuẩn, có bản đồ kèm bảng khoảng cách.
- [ ] **Phép 3 — Đếm điểm trong vùng phục vụ**: nếu có dữ liệu OSM điểm dân cư/POI trong khu vực (ví dụ điểm địa chỉ hoặc building centroid từ QuickOSM) → đếm số điểm rơi vào mỗi buffer bằng `native:countpointsinpolygon` hoặc join không gian — ra bảng "mỗi trạm đang phục vụ ước tính bao nhiêu điểm dân cư/POI".
- [ ] Viết toàn bộ 3 phép trên thành **1 script PyQGIS duy nhất** (`gis/scripts/analysis.py`), chạy được từ QGIS Python console hoặc `qgis_process`, input là layer PostGIS trực tiếp — không phải thao tác tay từng bước không lặp lại được (để demo và để báo cáo có thể nói "chạy lại được").
- [ ] Export kết quả: bản đồ (PNG/QGIS project `.qgz` lưu `gis/`), lớp kết quả dạng GeoJSON (`gis/data/buffer_result.geojson`, `gis/data/gap_areas.geojson`...) để Phase G3 (frontend) có thể hiển thị lại nếu muốn.

**Giao nộp phase này:** project QGIS (`.qgz`) + script PyQGIS chạy lại được + bản đồ kết quả 3 phép phân tích + số liệu (diện tích gap, khoảng cách nearest neighbor, số điểm/vùng phục vụ).

---

## Phase G3 — Frontend: bản đồ Leaflet (`StationsPage.jsx`)

Thuộc `frontend/src/pages/StationsPage.jsx` (file mới, không sửa `App.jsx`/`Layout.jsx`/`context/`/`api/`/`components/landing/` — khung của Người 2, theo quy tắc nhóm).

- [ ] Cài `leaflet` + `react-leaflet` (version cứng trong `package.json`, theo quy tắc chốt version của nhóm).
- [ ] Hiển thị marker trạm từ `GET /stations` (API client có sẵn `src/api/client.js`, không viết lại fetch tay).
- [ ] Marker đổi màu/icon theo `status` tổng hợp của trạm (idle/charging/fault — lấy từ cổng, cập nhật real-time qua WebSocket đã có ở backend theo `FEATURES.md`).
- [ ] Lọc trạm theo trạng thái + theo khoảng cách (gọi `GET /stations?near=&radiusKm=` ở Phase G1, dùng `navigator.geolocation` lấy vị trí tài xế hoặc cho nhập tay).
- [ ] (Tuỳ chọn, nếu còn thời gian) Overlay lớp GeoJSON kết quả buffer/gap từ Phase G2 lên bản đồ Leaflet (`gis/data/gap_areas.geojson`) — trực quan hoá luôn kết quả phân tích GIS ngay trên web app, không chỉ nằm trong báo cáo tĩnh.

**Giao nộp phase này:** trang `/stations` chạy thật trong app, không chỉ là ảnh chụp QGIS.

---

## Phase G4 — Tổng hợp báo cáo môn GIS

- [ ] Viết phần phương pháp: nguồn dữ liệu (OSM, PostGIS), hệ tọa độ dùng ở từng bước (4326 lưu trữ, 32648 khi đo đạc) — nêu rõ tại sao phải đổi, không đổi thì sai kết quả thế nào (có thể demo 1 ví dụ sai để minh hoạ).
- [ ] Trình bày 3 phép phân tích (Phase G2) kèm bản đồ + số liệu + nhận xét ý nghĩa thực tế (ví dụ: "khu vực X đang thiếu trạm sạc, nên ưu tiên lắp đặt ở đây").
- [ ] Bảng đối chiếu "tính năng/kỹ thuật đã làm → yêu cầu đề cương môn" (theo lưu ý chung ở `FEATURES.md` mục 2) — tránh bị hỏi "kỹ thuật X ở đâu" mà không chỉ ra được.
- [ ] Đính kèm script PyQGIS + hướng dẫn chạy lại (để giảng viên verify được, không chỉ tin ảnh chụp).

---

## Phụ thuộc giữa các phase

```
G0 (dữ liệu) ──► G1 (API /stations) ──► G3 (Leaflet map)
      │
      └────────► G2 (QGIS/PyQGIS phân tích) ──► G4 (báo cáo)
```

G1 và G2 có thể làm song song sau khi G0 xong (G1 không phụ thuộc G2). G3 phụ thuộc G1 (cần API thật). G4 cần cả G2 (số liệu/bản đồ) và nên chờ G1/G3 ổn định để báo cáo khớp demo.

---

## Nhật ký cập nhật

> Format: `YYYY-MM-DD — việc đã làm / quyết định thay đổi`.

- 2026-10-20 — Tạo roadmap này (chưa có ai bắt đầu code phần GIS; `stations` table rỗng, `gis/` chỉ có `.gitkeep`). Cần xác nhận với Người 3 trước khi bắt tay làm, vì đây thuộc phạm vi của bạn ấy theo `QUY_TAC_LAM_VIEC_NHOM.md` mục 2.
