#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <time.h>

// Mô phỏng 1 trạm sạc 2 cổng, gửi trạng thái lên server qua MQTT (1 chiều: mạch -> server).
// Hợp đồng bản tin: docs/contracts.md mục 1. Luồng nghiệp vụ: docs/LUONG_NGHIEP_VU.md.
//   - Nút bấm  = cắm / rút súng sạc (nhấn giữ 2s = giả lập lỗi fault, nhấn ngắn lúc fault = reset)
//   - Biến trở = công suất sạc; vặn về 0 = xe đã đầy pin nhưng chưa rút súng (vẫn "charging")

// ===== Cấu hình =====
// WiFi, broker, mật khẩu trạm nằm trong secrets.h (không commit).
// Lần đầu: copy secrets.example.h thành secrets.h rồi điền. Xem mosquitto/README.md.
// Broker bắt buộc đăng nhập; KHÔNG dùng broker công cộng không mật khẩu
// (vd broker.hivemq.com): ai cũng gửi được bản tin giả.
#include "secrets.h"

const char* STATION_ID = MQTT_USER;   // mã trạm = username MQTT (ACL stations/%u/status)

#define DHT_PIN   4
#define DHT_TYPE  DHT22
#define POT_PIN   34        // giả lập powerKw khi cổng đang charging (dùng chung 2 cổng)

#define HEARTBEAT_MS         5000UL   // contract: heartbeat <= 10s, server coi offline sau 60s im lặng
#define LONG_PRESS_MS        2000UL
#define DEBOUNCE_MS            30UL
#define DHT_READ_MS          2000UL   // DHT22 đọc tối đa ~0.5Hz
#define RECONNECT_MS         3000UL
#define OVERHEAT_C           80.0f
#define MAX_POWER_KW         22.0f
#define VALID_EPOCH  1700000000UL     // trước mốc này coi như chưa đồng bộ NTP

DHT dht(DHT_PIN, DHT_TYPE);
#if MQTT_USE_TLS
WiFiClientSecure netClient;
#else
WiFiClient netClient;
#endif
PubSubClient mqtt(netClient);

struct Port {
  int portId;
  int ledIdlePin;
  int ledChargingPin;
  int ledFaultPin;
  int buttonPin;
  const char* status;          // "idle" | "charging" | "fault"
  float energyKwh;
  // Chống dội nút bấm
  bool stablePressed;
  bool lastRawPressed;
  unsigned long lastRawChangeMs;
  unsigned long pressStartMs;
  // Gửi bản tin
  bool dirty;                  // đổi trạng thái chưa gửi được -> gửi ngay khi có kết nối
  unsigned long lastPublishMs;
};

Port ports[2] = {
  { 1, 16, 17, 18, 32, "idle", 0.0f, false, false, 0, 0, true, 0 },
  { 2, 19, 21, 22, 33, "idle", 0.0f, false, false, 0, 0, true, 0 },
};

float temperature = NAN;
unsigned long lastDhtMs = 0;
unsigned long lastLoopMs = 0;
unsigned long lastWifiTryMs = 0;
unsigned long lastMqttTryMs = 0;

void setStatus(Port &p, const char* newStatus) {
  if (strcmp(p.status, newStatus) == 0) return;
  Serial.printf("[port %d] %s -> %s\n", p.portId, p.status, newStatus);
  if (strcmp(newStatus, "charging") == 0) p.energyKwh = 0.0f;   // phiên mới: bộ đếm về 0
  p.status = newStatus;
  p.dirty = true;   // publish ngay, không chờ heartbeat (cắm/rút nhanh không bị mất phiên)
}

// ===== Kết nối (không chặn loop: nút bấm vẫn hoạt động khi mất mạng) =====
void ensureWifi(unsigned long nowMs) {
  if (WiFi.status() == WL_CONNECTED) return;
  if (nowMs - lastWifiTryMs < RECONNECT_MS && lastWifiTryMs != 0) return;
  lastWifiTryMs = nowMs;
  Serial.println("[wifi] dang ket noi lai...");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void ensureMqtt(unsigned long nowMs) {
  if (WiFi.status() != WL_CONNECTED || mqtt.connected()) return;
  if (nowMs - lastMqttTryMs < RECONNECT_MS && lastMqttTryMs != 0) return;
  lastMqttTryMs = nowMs;
  String clientId = String("esp32-") + STATION_ID;
  Serial.print("[mqtt] dang ket noi... ");
  if (mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
    Serial.println("OK");
    for (auto &p : ports) p.dirty = true;   // vừa kết nối lại: gửi ngay trạng thái hiện tại
  } else {
    // rc=5: sai user/password hoặc không có quyền (ACL)
    Serial.printf("that bai, rc=%d\n", mqtt.state());
  }
}

// ===== Bản tin =====
bool clockSynced() {
  return time(nullptr) > (time_t)VALID_EPOCH;
}

String isoTimestamp() {
  time_t now = time(nullptr);
  struct tm timeinfo;
  gmtime_r(&now, &timeinfo);
  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

float currentPowerKw(const Port &p) {
  if (strcmp(p.status, "charging") != 0) return 0.0f;
  int raw = analogRead(POT_PIN);                 // 0..4095
  return (raw / 4095.0f) * MAX_POWER_KW;         // 0..22 kW
}

bool publishStatus(Port &p) {
  if (!mqtt.connected()) return false;

  JsonDocument doc;
  doc["stationId"] = STATION_ID;
  doc["portId"] = p.portId;
  doc["status"] = p.status;
  doc["powerKw"] = roundf(currentPowerKw(p) * 100) / 100;
  doc["energyKwh"] = roundf(p.energyKwh * 1000) / 1000;
  if (isnan(temperature)) doc["temperature"] = nullptr;
  else doc["temperature"] = roundf(temperature * 10) / 10;
  // Chưa đồng bộ NTP -> gửi null, server tự dùng giờ của server (contract)
  if (clockSynced()) doc["timestamp"] = isoTimestamp();
  else doc["timestamp"] = nullptr;

  char payload[256];
  serializeJson(doc, payload, sizeof(payload));
  String topic = String("stations/") + STATION_ID + "/status";
  bool ok = mqtt.publish(topic.c_str(), payload);
  Serial.printf("[pub] %s -> %s : %s\n", topic.c_str(), ok ? "OK" : "FAIL", payload);
  return ok;
}

// ===== Nút bấm (có chống dội) =====
void onRelease(Port &p, unsigned long heldMs) {
  bool safeTemp = isnan(temperature) || temperature < OVERHEAT_C;
  if (heldMs >= LONG_PRESS_MS) {
    setStatus(p, "fault");                                   // giả lập lỗi thiết bị
  } else if (strcmp(p.status, "idle") == 0 && safeTemp) {
    setStatus(p, "charging");                                // cắm súng
  } else if (strcmp(p.status, "charging") == 0) {
    setStatus(p, "idle");                                    // rút súng
  } else if (strcmp(p.status, "fault") == 0 && safeTemp) {
    setStatus(p, "idle");                                    // reset lỗi khi đã hết nóng
  }
}

void updateButton(Port &p, unsigned long nowMs) {
  bool raw = (digitalRead(p.buttonPin) == LOW);
  if (raw != p.lastRawPressed) {
    p.lastRawPressed = raw;
    p.lastRawChangeMs = nowMs;
  }
  if (nowMs - p.lastRawChangeMs < DEBOUNCE_MS || raw == p.stablePressed) return;

  p.stablePressed = raw;
  if (raw) {
    p.pressStartMs = nowMs;
  } else {
    onRelease(p, nowMs - p.pressStartMs);
  }
}

void updateLed(const Port &p) {
  digitalWrite(p.ledIdlePin,     strcmp(p.status, "idle") == 0);
  digitalWrite(p.ledChargingPin, strcmp(p.status, "charging") == 0);
  digitalWrite(p.ledFaultPin,    strcmp(p.status, "fault") == 0);
}

void setup() {
  Serial.begin(115200);
  dht.begin();

  for (auto &p : ports) {
    pinMode(p.ledIdlePin, OUTPUT);
    pinMode(p.ledChargingPin, OUTPUT);
    pinMode(p.ledFaultPin, OUTPUT);
    pinMode(p.buttonPin, INPUT_PULLUP);
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org");   // giờ UTC cho field timestamp (đồng bộ chạy nền)

#if MQTT_USE_TLS
  // Mã hoá kênh truyền nhưng chưa kiểm tra chứng chỉ server (đủ cho demo).
  // Triển khai thật: netClient.setCACert(<chứng chỉ gốc của broker>) để chống giả mạo broker.
  netClient.setInsecure();
#endif
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setKeepAlive(15);
  lastLoopMs = millis();
}

void loop() {
  unsigned long nowMs = millis();
  ensureWifi(nowMs);
  ensureMqtt(nowMs);
  mqtt.loop();

  unsigned long deltaMs = nowMs - lastLoopMs;
  lastLoopMs = nowMs;

  if (nowMs - lastDhtMs >= DHT_READ_MS || lastDhtMs == 0) {
    lastDhtMs = nowMs;
    float t = dht.readTemperature();
    if (isnan(t)) Serial.println("[dht] doc nhiet do that bai");
    temperature = t;
  }

  for (auto &p : ports) {
    if (!isnan(temperature) && temperature >= OVERHEAT_C) {
      setStatus(p, "fault");   // quá nhiệt: báo lỗi mọi cổng, kể cả đang sạc
    }

    updateButton(p, nowMs);
    updateLed(p);

    if (strcmp(p.status, "charging") == 0) {
      p.energyKwh += currentPowerKw(p) * (deltaMs / 3600000.0f);   // chỉ tăng trong phiên
    }

    // Gửi ngay khi đổi trạng thái; ngoài ra gửi heartbeat định kỳ
    if (p.dirty || nowMs - p.lastPublishMs >= HEARTBEAT_MS) {
      if (publishStatus(p)) {
        p.dirty = false;
        p.lastPublishMs = nowMs;
      }
    }
  }
}
