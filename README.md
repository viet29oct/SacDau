# SacDau — Hệ thống quản lý mạng lưới trạm sạc xe điện

Đồ án dùng chung 5 môn: IoT, Ngôn ngữ kịch bản, Web an toàn, GIS, Phân tích dữ liệu.

**Mở lại dự án sau khi nghỉ?** Đọc [`docs/NEXT_SESSION.md`](docs/NEXT_SESSION.md) trước — tóm tắt trạng thái hiện tại, không cần đọc lại từ đầu.

**Đọc trước khi code (lần đầu):**

1. [`docs/TECH_STACK.md`](docs/TECH_STACK.md) — công nghệ dùng cho từng tầng.
2. [`docs/QUY_TAC_LAM_VIEC_NHOM.md`](docs/QUY_TAC_LAM_VIEC_NHOM.md) — luật chơi chung của nhóm (version, phân module, file cấu hình, JSON contract, mocking, linter, `.env`).
3. [`docs/FEATURES.md`](docs/FEATURES.md) — phạm vi tính năng đã chốt.
4. [`docs/contracts.md`](docs/contracts.md) — JSON contract (MQTT, REST API, VNPay).
5. [`docs/ROADMAP.md`](docs/ROADMAP.md) — checklist công việc, cập nhật liên tục theo tiến độ.

## Cấu trúc thư mục

```
SacDau/
├── iot/            # ESP32 (Wokwi) + mock MQTT publisher
├── backend/        # Node.js + Express
├── frontend/        # React + Leaflet
├── gis/            # QGIS, PyQGIS scripts, dữ liệu không gian
├── analytics/       # Notebook phân tích, Power BI
├── security/        # Báo cáo kiểm thử bảo mật
└── docs/           # Tài liệu dự án
```
