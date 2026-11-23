# GIS — plugin chủ đề 35 (môn Hệ thống thông tin không gian)

Bài tập nhóm môn HTTTKG lớp D18CNPM1, nhóm 6: **chủ đề 35**, xây dựng Processing Plugin xác định vùng phục vụ và số khách hàng dễ tiếp cận dịch vụ ngành điện. Phần mở rộng dùng trạm sạc của SacDau làm đơn vị phục vụ. Việc còn lại và kịch bản demo: [`docs/ROADMAP.md`](../docs/ROADMAP.md) mục GIS.

```
gis/
├── sacdau_service_area/      # plugin QGIS — thư mục này là bài nộp
│   ├── metadata.txt
│   ├── plugin.py             # nút trên toolbar + menu SacDau
│   ├── provider.py           # provider Processing "SacDau"
│   └── algorithms/service_area.py   # thuật toán
├── data/
│   ├── stations_osm.geojson  # 46 trạm sạc OSM trong Bắc Ninh cũ
│   └── raw/                  # dữ liệu nặng, không commit (gitignore)
└── scripts/
```

## Dữ liệu

### Bộ dữ liệu của môn (không commit, 362 MB)

Đặt bộ "Bo du lieu thuc hanh QGIS nganh dien++ Bac Ninh" vào `gis/data/raw/BacNinh/`, **giữ nguyên cấu trúc** `Data Goc/` và `SanPhamMau/`. Hai project mẫu `.qgz` trong `SanPhamMau/Template/QGIS Project/` trỏ tới dữ liệu bằng đường dẫn tương đối, nên đổi cấu trúc thư mục thì project mất lớp.

- **Hệ toạ độ:** hầu hết các lớp ở **EPSG:32648** (WGS 84 / UTM 48N). Riêng `DuLieuKhac/DuongBo_VN2000.shp` ở VN-2000, lệch khoảng 200 m so với `DuongBo.shp`. Lớp này dành cho các chủ đề chuyển hệ toạ độ.
- **Phạm vi:** dữ liệu chi tiết (lưới điện, dân cư, nhà, đường) chỉ phủ **Bắc Ninh cũ**, tức `KhuVucNghienCuu.shp` (820 km²). Các lớp hành chính 2025 (`BacNinh2025_*`, `BacNinh2025_KhuVucQLDienLuc`) phủ cả **Bắc Ninh mới**, gồm vùng Bắc Giang cũ, nơi không có dữ liệu dân cư.
- **Lớp dùng cho chủ đề 35:**
  - Đơn vị: `DuLieuDienLuc/DonViQuanLyDienLuc/DonViQuanLyDienLucBacNinh.shp`, 22 điểm. Trường `Tỉnh cũ` phân biệt `Bắc Ninh` (12) và `Bắc Giang` (9).
  - Khách hàng: `DuLieuNenDiaLy/HaTangDanCu/DiaDanhDanCu.shp`, 665 làng/thôn/xóm.
  - Khu vực nghiên cứu: `DuLieuNenDiaLy/BienGioiDiaGioi/KhuVucNghienCuu.shp`.

### Trạm sạc OSM — `data/stations_osm.geojson`

46 điểm `amenity=charging_station`, truy vấn Overpass ngày **2026-11-23**:

```
[out:json][timeout:120];
area["boundary"="administrative"]["admin_level"="4"]["name"~"Bắc Ninh"]->.a;
nwr["amenity"="charging_station"](area.a);
out center tags;
```

Truy vấn trả về 56 điểm trong Bắc Ninh mới. Các bước xử lý tiếp:

1. Lấy toạ độ tâm (`out center`) cho cả node và way.
2. Giữ những điểm nằm trong `KhuVucNghienCuu.shp`, còn 46 điểm.
3. Lưu ở EPSG:4326, cùng hệ với cột `geom` trong DB SacDau.

Không có cặp điểm nào cách nhau dưới 50 m, nên không phải gộp trùng.

| Trường | Ý nghĩa |
|---|---|
| `code` | `BN001`…`BN046`, xếp theo `osm_id`. Dùng làm `code` khi nạp vào DB SacDau. Không dùng `ST01` vì mã này dành cho trạm demo IoT |
| `osm_id` | `n…` là node, `w…` là way |
| `name`, `operator` | Theo OSM. 43/46 trạm của VinFast, 3 trạm không có tên |

OSM **không có** số cổng (`capacity`) hay loại xe cho các trạm này, nên số cổng trong SacDau là giá trị gán thêm. Dữ liệu © OpenStreetMap contributors, giấy phép ODbL. Báo cáo và bản đồ web phải ghi nguồn này.

## Cài plugin (QGIS 3.44 LTR)

**Khi phát triển**, tạo junction từ thư mục plugin của QGIS tới repo. Sửa code xong chỉ cần nạp lại plugin, không phải copy file. Lệnh PowerShell, không cần quyền admin:

```powershell
New-Item -ItemType Junction `
  -Path "$env:APPDATA\QGIS\QGIS3\profiles\default\python\plugins\sacdau_service_area" `
  -Target "<đường dẫn repo>\gis\sacdau_service_area"
```

Mở QGIS → *Plugins → Manage and Install Plugins → Installed* → tick **SacDau - Vùng phục vụ**. Nên cài thêm plugin *Plugin Reloader* để nạp lại sau mỗi lần sửa code.

**Khi nộp bài**, nén thư mục plugin rồi cài bằng *Plugins → Manage and Install Plugins → Install from ZIP*:

```powershell
Get-ChildItem gis\sacdau_service_area -Recurse -Directory -Filter __pycache__ | Remove-Item -Recurse -Force
Compress-Archive -Path gis\sacdau_service_area -DestinationPath sacdau_service_area.zip -Force
```

## Dùng plugin

Bấm nút trên toolbar, menu *Plugins → SacDau*, hoặc mở *Processing Toolbox → SacDau → Phân tích → Vùng phục vụ và khách hàng*.

| Tham số | Ghi chú |
|---|---|
| Lớp đơn vị phục vụ | Điểm hoặc vùng. Tick *Selected features only* để chỉ dùng các đơn vị đang chọn trên bản đồ |
| Lọc đơn vị | Biểu thức, vd `"Tỉnh cũ" = 'Bắc Ninh'` hoặc `"ten" LIKE '%Từ Sơn%'`. Biểu thức sai cú pháp sẽ báo lỗi |
| Lớp khách hàng | Lớp điểm |
| Trường trọng số | Tuỳ chọn, trường số (vd dân số). Kết quả có thêm trường `tong_ts` |
| Bán kính phục vụ (m) | Mặc định 3000 |
| Hệ toạ độ phẳng | Mặc định EPSG:32648. Không nhận hệ địa lý (độ) |
| Khu vực nghiên cứu | Tuỳ chọn. Có thì tính thêm vùng trống |

Kết quả gồm 4 lớp và 4 con số:

- **Vùng phục vụ:** thuộc tính của đơn vị, kèm `so_kh` (số khách hàng trong vùng), `ban_kinh_m` và `dt_km2`.
- **Khách hàng được phục vụ** và **khách hàng chưa được phục vụ.** Mỗi khách hàng chỉ tính một lần dù nằm trong nhiều vùng chồng nhau.
- **Vùng trống:** khu vực nghiên cứu trừ đi hợp các vùng phục vụ, kèm `dt_km2`.
- **Tổng số liệu** ghi ở cửa sổ log: tổng khách hàng, số được phục vụ, tỉ lệ %, diện tích vùng trống.

Giải thuật: lọc đơn vị → reproject về hệ phẳng → `native:buffer` → `native:countpointsinpolygon` → `native:extractbylocation` (giao / không giao) → `native:dissolve` + `native:difference` cho vùng trống. Toàn bộ chạy bằng thuật toán native nên mất vài giây.

### Kết quả mẫu (2026-11-23)

Khách hàng là `DiaDanhDanCu` (665 điểm), bán kính 3 km, khu vực nghiên cứu là Bắc Ninh cũ:

| Đơn vị phục vụ | Số đơn vị | KH được phục vụ | Tỉ lệ | Vùng trống |
|---|---|---|---|---|
| Đơn vị QLĐL, lọc `"Tỉnh cũ" = 'Bắc Ninh'` | 12 | 221 | 33,23% | 560,553 km² |
| Trạm sạc OSM (`stations_osm.geojson`) | 46 | 420 | 63,16% | 322,857 km² |

Đã kiểm tra chéo bằng SQL `ST_Distance <= 3000` trên GDAL, độc lập với QGIS: Đội QLĐL Kinh Bắc 29, Từ Sơn 28, Quế Võ 19, tổng 221 khách hàng được phục vụ, trùng với kết quả của plugin. Chạy không lọc (22 đơn vị) cũng ra 221, vì 9 đơn vị vùng Bắc Giang cũ và 1 đơn vị không ghi tỉnh đều không có khách hàng nào trong bán kính.
