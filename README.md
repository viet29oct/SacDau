# SacDau — Hệ thống quản lý mạng lưới trạm sạc xe điện

Đồ án dùng chung 4 môn: IoT, Ngôn ngữ kịch bản, Web an toàn, GIS.

ESP32 (Wokwi) gửi trạng thái cổng sạc qua MQTT → backend Node.js tự suy ra phiên sạc, tính tiền, thanh toán VNPay sandbox → frontend React hiển thị real-time qua WebSocket. Quản lý trạm là cầu nối người–thiết bị (check-in bằng mã), vì mạch chỉ gửi dữ liệu 1 chiều.

## Tài liệu

| File | Đọc khi nào |
|---|---|
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | **Đọc đầu tiên** — tiến độ từng mảng, việc còn lại, việc cần cả nhóm chốt |
| [`docs/QUY_TAC_LAM_VIEC_NHOM.md`](docs/QUY_TAC_LAM_VIEC_NHOM.md) | Trước khi code: ai sở hữu file nào, nhánh/PR, `.env`, đổi contract |
| [`docs/TECH_STACK.md`](docs/TECH_STACK.md) | Công nghệ + version đã chốt của từng tầng |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Phạm vi tính năng theo vai trò, theo môn, và những gì đã cắt |
| [`docs/LUONG_NGHIEP_VU.md`](docs/LUONG_NGHIEP_VU.md) | Trước khi động vào đặt chỗ / phiên sạc / thanh toán — luồng và các kịch bản xấu |
| [`docs/contracts.md`](docs/contracts.md) | Khi viết API, frontend hoặc firmware — field, endpoint, error code, MQTT, WebSocket |
| [`mosquitto/README.md`](mosquitto/README.md) | Tạo tài khoản MQTT, chạy mạch Wokwi nối vào broker |
| [`docs/PGADMIN.md`](docs/PGADMIN.md) | Xem/sửa DB bằng pgAdmin: thông tin kết nối (cổng 5433) và các lỗi đăng nhập hay gặp |
| [`gis/README.md`](gis/README.md) | Môn GIS: plugin QGIS chủ đề 35, bộ dữ liệu Bắc Ninh, trạm sạc OSM, cách cài và chạy |

## Cấu trúc thư mục

```
SacDau/
├── iot/            # ESP32 (Wokwi): sketch.ino, diagram.json, secrets.example.h
├── backend/        # Node.js + Express (JavaScript CommonJS), migration, test
├── frontend/       # React + Vite + Tailwind
├── gis/            # Plugin QGIS (môn HTTTKG), dữ liệu trạm sạc OSM
├── mosquitto/      # Cấu hình broker MQTT (xác thực + ACL theo trạm)
├── security/       # Báo cáo kiểm thử bảo mật
└── docs/           # Tài liệu dự án
```

## Chạy dự án trên máy mới

Cần: Node `24.19.0` (`.nvmrc`), Docker Desktop, Git.

```bash
# 1. Biến môi trường
cp .env.example .env                       # Postgres cho docker compose
cp backend/.env.example backend/.env       # điền JWT_SECRET, VNPAY_*, MQTT_PASSWORD

# 2. Broker MQTT cần file mật khẩu trước khi khởi động — làm theo mosquitto/README.md
#    (tài khoản sacdau_backend trùng MQTT_PASSWORD ở backend/.env, + tài khoản trạm ST01)

# 3. Postgres + Mosquitto
docker compose up -d

# 4. Backend
cd backend
npm ci
npm run migrate:up
npm run create-admin -- "Tên Admin" admin@example.com matkhau123
npm run dev                                # http://localhost:3000/health

# 5. Frontend (terminal khác)
cd frontend
cp .env.example .env                       # VITE_API_URL
npm ci
npm run dev                                # http://localhost:5173
```

Postgres chạy ở cổng host **`5433`** (không phải 5432).

**Test tự động** (DB riêng `sacdau_test`, mỗi lần chạy xoá sạch dữ liệu):

```bash
docker exec sacdau_postgres psql -U sacdau_user -d sacdau -c "CREATE DATABASE sacdau_test;"   # 1 lần
cd backend && npm run test:db:migrate && npm test
```

**Chạy thử toàn luồng** không cần mạch/frontend: khi `npm run dev` đang chạy, mở terminal khác `cd backend && npm run e2e:demo` (trong giờ 6h–22h). Script tạo dữ liệu, đi qua đặt chỗ → cọc → check-in → sạc qua MQTT → phiên trái phép → báo cáo, rồi tự dọn. Thêm `-- --keep` để giữ dữ liệu (trạm `ST01` 2 cổng, tài khoản `*@sacdau.test` / `matkhau123`).

**Demo VNPay thật:** VNPay không gọi được `localhost`, nên cần tunnel (vd `cloudflared tunnel --url http://localhost:3000`) rồi khai `https://<tunnel>/payments/vnpay-ipn` ở mục cấu hình IPN trên cổng merchant sandbox. Không có tunnel thì trả cọc xong booking vẫn bị huỷ sau 5 phút (tiền vào diện cần hoàn khi IPN đến sau).

**Demo mạch Wokwi:** xem `mosquitto/README.md` mục "Demo với Wokwi".
