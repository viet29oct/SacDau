# SacDau — Hệ thống quản lý mạng lưới trạm sạc xe điện

Đồ án dùng chung 4 môn: IoT, Ngôn ngữ kịch bản, Web an toàn, GIS.

**Đọc trước khi code (lần đầu):**

1. [`docs/TECH_STACK.md`](docs/TECH_STACK.md) — công nghệ dùng cho từng tầng.
2. [`docs/QUY_TAC_LAM_VIEC_NHOM.md`](docs/QUY_TAC_LAM_VIEC_NHOM.md) — luật chơi chung của nhóm (version, phân module, file cấu hình, JSON contract, mocking, linter, `.env`).
3. [`docs/FEATURES.md`](docs/FEATURES.md) — phạm vi tính năng đã chốt.
4. [`docs/LUONG_NGHIEP_VU.md`](docs/LUONG_NGHIEP_VU.md) — luồng nghiệp vụ (đặt chỗ, cọc, check-in, phiên sạc, thanh toán) và cách chặn các kịch bản xấu.
5. [`docs/contracts.md`](docs/contracts.md) — JSON contract (MQTT, REST API, WebSocket, VNPay).
6. [`docs/ROADMAP.md`](docs/ROADMAP.md) — checklist công việc, cập nhật liên tục theo tiến độ.

## Cấu trúc thư mục

```
SacDau/
├── iot/            # ESP32 (Wokwi) + mock MQTT publisher
├── backend/        # Node.js + Express
├── frontend/       # React + Leaflet
├── gis/            # QGIS, PyQGIS scripts, dữ liệu không gian
├── mosquitto/      # Cấu hình broker MQTT (xác thực + ACL theo trạm)
├── security/       # Báo cáo kiểm thử bảo mật
└── docs/           # Tài liệu dự án
```
