// Mẫu cấu hình bí mật của mạch. Cách dùng:
//   copy secrets.example.h secrets.h   rồi điền giá trị thật vào secrets.h
// secrets.h nằm trong .gitignore — KHÔNG commit mật khẩu thật.
// Trên wokwi.com: thêm 1 tab tên "secrets.h" vào project và dán nội dung file này.
#pragma once

#define WIFI_SSID      "Wokwi-GUEST"
#define WIFI_PASSWORD  ""

// Username = mã trạm (stations.code trên server), mật khẩu tạo theo mosquitto/README.md.
#define MQTT_USER      "ST01"
#define MQTT_PASS      "doi_mat_khau_tram_ST01"

// Cách 1 (mặc định) — Wokwi trong VS Code nối thẳng Mosquitto trên máy (Docker):
//   host.wokwi.internal là tên Wokwi trỏ về chính máy đang chạy simulator.
#define MQTT_HOST      "host.wokwi.internal"
#define MQTT_PORT      1883
#define MQTT_USE_TLS   0

// Cách 2 — broker cloud có TLS (vd EMQX Cloud Serverless), dùng khi chạy trên wokwi.com:
// #define MQTT_HOST      "<dia-chi-deployment>"
// #define MQTT_PORT      8883
// #define MQTT_USE_TLS   1
