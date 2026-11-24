# Phân công nhóm 6 — môn HTTTKG, chủ đề 35

Plugin QGIS xác định vùng phục vụ và số khách hàng dễ tiếp cận dịch vụ ngành điện, phần mở rộng dùng trạm sạc SacDau. Đề, dữ liệu, cách cài plugin: [`README.md`](README.md). Mỗi việc là một GitHub Issue nhãn `mon:gis`, tiến độ theo dõi ở đó; [`docs/ROADMAP.md`](../docs/ROADMAP.md) mục GIS chỉ còn tổng quan, Việt/Phi cập nhật. File này chỉ ghi ai làm gì. Ai duyệt, ai quyết: [`docs/QUY_TAC_LAM_VIEC_NHOM.md`](../docs/QUY_TAC_LAM_VIEC_NHOM.md) mục 9.

Điểm: plugin + hướng dẫn + báo cáo 40%, slide + trình bày 60%. Mỗi người tự trình bày phần mình làm, nên ai cũng phải có một phần chạy được để demo.

## Thành viên

| | Họ tên | Trong SacDau | Phụ trách chính (GIS) |
|---|---|---|---|
| 1 | Hoàng Tùng Dương | — | Style bản đồ, gộp slide |
| 2 | Đỗ Minh Huấn | Người 3 | Bản đồ web, nhắc tiến độ GIS |
| 3 | Nguyễn Bảo Phi | Người 2 | Bảng tổng hợp CSV, kịch bản demo |
| 4 | Nguyễn Văn Phong | — | Dân số làm trọng số |
| 5 | Nguyễn Huy Tiệp | — | Đóng gói plugin, hướng dẫn cài đặt, gộp báo cáo |
| 6 | Nguyễn - Serov Trọng Việt | Người 1, trưởng nhóm | Nạp trạm vào DB, plugin đọc PostGIS, phần giải thuật |

## Việc gấp

- **Huấn:** hỏi giáo viên dùng SacDau làm phần mở rộng có được không. Báo lại Việt/Phi; không được thì Việt/Phi quyết bỏ phần G2, Việt và Huấn chuyển sang hỗ trợ G1/G3.
- **Dương, Phong, Tiệp:** gửi username GitHub và `git config user.name` cho Việt hoặc Phi để ghi vào `.github/members.txt`, làm xong mục "Bắt đầu" bên dưới.

## Việc từng người

### 1. Dương — style và slide

- Style `.qml` cho 4 lớp kết quả (vùng phục vụ, KH được phục vụ, KH chưa được phục vụ, vùng trống), dựa theo style trong `SanPhamMau/Style` của môn. Plugin tự áp style khi nạp kết quả. File style để trong `sacdau_service_area/styles/`, phần nối vào code nhờ Việt hoặc Huấn.
- Xuất ảnh bản đồ kết quả (2 lần chạy: đơn vị điện lực và trạm sạc) cho báo cáo và slide.
- Gộp slide cả nhóm, giữ một mẫu thống nhất.
- Báo cáo: phần trình bày bản đồ.

### 2. Huấn — bản đồ web

- Nhắc tiến độ GIS trên các issue `mon:gis`, comment góp ý PR (không duyệt/merge, mục 9 QUY_TAC).
- Xuất vùng trống ra `gis/data/` (GeoJSON, EPSG:4326) cho bản đồ web.
- Bản đồ web `frontend/src/pages/StationsPage.jsx`: Leaflet, marker trạm theo trạng thái cổng, lọc theo khoảng cách, overlay vùng trống. Thêm thư viện `leaflet` cần Việt/Phi đồng ý, ghi version vào `docs/TECH_STACK.md` trước.
- Báo cáo: phân tích yêu cầu, phần mở rộng SacDau, bảng phân công.

### 3. Phi — số liệu và kịch bản demo

- Bảng tổng hợp theo đơn vị (đơn vị, số KH, tỉ lệ) xuất CSV để đưa vào báo cáo.
- Viết kịch bản demo khoảng 10 phút theo 3 bước ở ROADMAP mục G3. Chạy thử trọn kịch bản trên máy sẽ dùng để thuyết trình, đo giờ.
- Báo cáo: hệ toạ độ (dữ liệu môn ở EPSG:32648, trạm sạc ở 4326, đo trên hệ phẳng) và bảng kết quả số liệu.

### 4. Phong — dân số làm trọng số

- Gán dân số xã (`DanSoPXa2025`) cho từng làng để dùng làm trường trọng số, ra "số dân được phục vụ" thay vì chỉ số làng. Cách chia dân số xã cho các làng phải ghi rõ trong báo cáo.
- Đối chiếu kết quả có trọng số với kết quả mẫu trong `README.md`.
- Báo cáo: phần dữ liệu (bộ dữ liệu của môn, 46 trạm sạc OSM, dân số).

### 5. Tiệp — đóng gói và báo cáo

- Nén plugin thành `.zip` (lệnh ở `README.md`), cài thử trên một máy chưa có repo (QGIS 3.44 LTR), ghi lại lỗi gặp phải.
- Viết hướng dẫn cài đặt và sử dụng, kèm ảnh chụp giao diện plugin.
- Gộp báo cáo của cả nhóm thành một file (hướng dẫn + báo cáo), soát trình bày trước khi nộp.
- Báo cáo: phần giao diện plugin.

### 6. Việt — tích hợp SacDau

- Nạp 46 trạm vào DB SacDau qua `POST /stations`, lấy `code` từ `data/stations_osm.geojson`.
- Chạy plugin với lớp trạm sạc đọc thẳng từ PostGIS của SacDau.
- Hỗ trợ code plugin cho các việc trên (nối style, trường trọng số).
- Báo cáo: phần giải thuật.

## Báo cáo và slide

| Phần báo cáo | Người viết |
|---|---|
| Phân tích yêu cầu | Huấn |
| Dữ liệu | Phong |
| Hệ toạ độ, kết quả số liệu | Phi |
| Giải thuật | Việt |
| Giao diện, hướng dẫn cài đặt/sử dụng | Tiệp |
| Trình bày bản đồ | Dương |
| Mở rộng với SacDau, phân công | Huấn |

Tiệp gộp báo cáo, Dương gộp slide. File báo cáo và slide để ngoài repo (Google Drive của nhóm), repo chỉ giữ code và dữ liệu nhỏ.

## Bắt đầu (cho Dương, Phong, Tiệp)

1. Cài Git và QGIS 3.44 LTR.
2. Clone repo, rồi bật hook của nhóm: `git config core.hooksPath .githooks`.
3. Lấy bộ dữ liệu của môn từ Huấn, đặt vào `gis/data/raw/BacNinh/` (không commit, xem `README.md`).
4. Cài plugin theo `README.md` mục "Cài plugin", chạy thử ra đúng kết quả mẫu.
5. Làm trên nhánh của mình, đã tạo sẵn trên GitHub: `git checkout Duong` (hoặc `Phong`, `Tiep`). Mở PR vào `main`, Việt hoặc Phi duyệt. Hook `pre-push` chặn nếu bạn push nhầm lên `main` hay nhánh người khác.
6. Chỉ sửa trong `gis/`. PR có file ngoài `gis/` sẽ bị CI `scope-guard` báo đỏ và không merge được. Cần đổi thứ gì ở ngoài thì nhắn Việt hoặc Phi.
7. Không commit dữ liệu môn (`.shp`, `.dbf`…), project QGIS (`.qgz`) hay file > 1 MB: CI `files-guard` chặn.

Dùng AI agent (Codex, Claude Code, Gemini…) thì theo [`AGENTS.md`](../AGENTS.md): agent phải đọc tài liệu trước, commit và PR không được có dòng ghi công AI. Quy tắc nhóm đầy đủ: [`docs/QUY_TAC_LAM_VIEC_NHOM.md`](../docs/QUY_TAC_LAM_VIEC_NHOM.md).
