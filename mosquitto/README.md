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

## Demo với Wokwi

Mạch đọc cấu hình từ `iot/secrets.h` (không commit). Lần đầu: copy `iot/secrets.example.h` thành `iot/secrets.h`, điền mật khẩu trạm (bước 2 ở trên, hoặc lấy trong `mosquitto/stations.local`).

**Cách 1 (mặc định) — Wokwi trong VS Code nối thẳng Mosquitto trên máy.** Extension Wokwi cho VS Code có sẵn gateway mạng chạy trên máy, nên mạch ảo gọi được máy thật qua tên `host.wokwi.internal`. Dùng luôn Mosquitto + ACL ở trên, không cần broker cloud. Đã chạy thật 2026-11-19.

1. `docker compose up -d`; `cd backend && npm run dev` (giữ `MQTT_BROKER_URL=mqtt://localhost:1883`).
2. `iot/secrets.h`: `MQTT_HOST "host.wokwi.internal"`, `MQTT_PORT 1883`, `MQTT_USE_TLS 0`, `MQTT_USER "ST01"` + mật khẩu.
3. `cd iot && pio run` → F1 → *Wokwi: Start Simulator*. Serial phải thấy `[mqtt] dang ket noi... OK`.
4. DB phải có trạm mã `ST01` đủ 2 cổng (vd `npm run e2e:demo -- --keep`).

Lỗi thường gặp: `rc=5` sai mật khẩu / username khác mã trạm; `rc=-2` Docker chưa chạy hoặc firewall chặn cổng 1883. Wokwi cho VS Code có thể đòi license sau thời gian dùng thử.

**Cách 2 — chạy trên wokwi.com (trình duyệt).** Mạng của mạch đi qua gateway công cộng của Wokwi trên cloud, không vào được máy bạn → cần broker cloud có TLS + đăng nhập, vd **EMQX Cloud Serverless** (gói free hằng tháng, chỉ nhận TLS cổng `8883`, bắt buộc đăng nhập). Không dùng HiveMQ Cloud: gói Serverless free đã ngừng tạo mới và bị gỡ ngày 2026-12-31.

- Tạo deployment, bật TLS (cổng `8883`); ESP32 dùng `WiFiClientSecure` (`MQTT_USE_TLS 1`). Trên wokwi.com thêm tab `secrets.h` vào project.
- Tạo tài khoản cho từng trạm (`ST01`) và cho backend (`sacdau_backend`); nếu gói có phân quyền theo topic thì trạm chỉ *publish* `stations/ST01/status`, backend chỉ *subscribe* `stations/+/status`. Chưa kiểm tra thật cách này — xem lại giao diện EMQX lúc tạo.
- Backend: đổi `MQTT_BROKER_URL=mqtts://<dia-chi-deployment>:8883`, `MQTT_USERNAME`, `MQTT_PASSWORD` trong `backend/.env`.
