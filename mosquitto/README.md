# Broker MQTT (Mosquitto) — có xác thực

Broker **không cho kết nối ẩn danh** (từ 2026-11-18). Lý do: server tin dữ liệu thiết bị để mở/đóng phiên sạc và tính tiền; broker ẩn danh thì ai cũng publish được bản tin giả vào `stations/<mã>/status`.

| Tài khoản | Quyền (file `acl`) | Dùng ở đâu |
|---|---|---|
| `sacdau_backend` | chỉ **đọc** `stations/+/status` | `backend/.env`: `MQTT_USERNAME`, `MQTT_PASSWORD` |
| `<mã trạm>` (vd `ST01`) | chỉ **ghi** `stations/<mã trạm>/status` | ESP32 / mock publisher của đúng trạm đó |

Username của trạm **phải trùng mã trạm** (`stations.code`) — ACL dùng `pattern write stations/%u/status`, nên trạm `ST01` không thể giả bản tin của `ST02`. Backend kiểm tra thêm `stationId` trong payload phải trùng mã trên topic.

## Tạo file mật khẩu (làm 1 lần trên mỗi máy)

File `mosquitto/passwd` chứa mật khẩu đã băm, **không commit** (đã có trong `.gitignore`). Chạy từ thư mục gốc repo:

```bash
# 1. Tạo file + tài khoản backend (mật khẩu trùng MQTT_PASSWORD trong backend/.env)
docker compose run --rm --entrypoint mosquitto_passwd mosquitto -b -c /mosquitto/config/passwd sacdau_backend <MAT_KHAU_BACKEND>

# 2. Thêm tài khoản cho từng trạm (KHÔNG có -c, nếu không sẽ ghi đè file)
docker compose run --rm --entrypoint mosquitto_passwd mosquitto -b /mosquitto/config/passwd ST01 <MAT_KHAU_TRAM_ST01>

# 3. Khởi động lại broker để nạp mật khẩu
docker compose restart mosquitto
```

Thiếu file `passwd` thì container Mosquitto không khởi động được — làm bước 1 trước `docker compose up`.

## Kiểm tra nhanh

```bash
# Không đăng nhập -> bị từ chối (Connection Refused: not authorised)
docker exec sacdau_mosquitto mosquitto_pub -t stations/ST01/status -m '{}'

# Trạm ST01 publish đúng topic của mình -> backend nhận
docker exec sacdau_mosquitto mosquitto_pub -u ST01 -P <MAT_KHAU_TRAM_ST01> -t stations/ST01/status \
  -m '{"stationId":"ST01","portId":1,"status":"charging","powerKw":7.4,"energyKwh":0,"temperature":30,"timestamp":null}'

# Trạm ST01 publish vào topic của ST02 -> broker âm thầm bỏ (ACL), backend không nhận gì
```

## Demo với Wokwi (chạy trên cloud, không vào được broker trên máy)

Dùng **HiveMQ Cloud bản Serverless (free)**, không dùng broker công cộng không mật khẩu (`broker.hivemq.com`):

- Tạo 1 cluster, bật TLS (cổng `8883`); ESP32 dùng `WiFiClientSecure`.
- Tạo credential cho từng trạm và cho backend. Bản free cho **mỗi credential 1 permission, 1 topic filter**: trạm `ST01` → *Publish only* `stations/ST01/status`; backend → *Subscribe only* `stations/+/status`. Kiểm tra lại trên giao diện khi tạo (HiveMQ có thể đổi chính sách gói free).
- Backend: đổi `MQTT_BROKER_URL=mqtts://<cluster>.hivemq.cloud:8883`, `MQTT_USERNAME`, `MQTT_PASSWORD` trong `backend/.env`.
