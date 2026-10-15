#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <time.h>

const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

// Demo trên Wokwi: broker công khai vì không vào được localhost.
// Khi gắn Mosquitto thật (docker-compose), đổi sang IP máy host.
const char* MQTT_HOST = "broker.hivemq.com";
const int   MQTT_PORT = 1883;
const char* STATION_ID = "ST01";

#define DHT_PIN   4
#define DHT_TYPE  DHT22
#define POT_PIN   34        // giả lập powerKw khi port đang charging

#define PUBLISH_INTERVAL_MS 5000UL
#define LONG_PRESS_MS        2000UL
#define OVERHEAT_C           80.0f

DHT dht(DHT_PIN, DHT_TYPE);
WiFiClient espClient;
PubSubClient mqtt(espClient);

struct Port {
  int portId;
  int ledIdlePin;
  int ledChargingPin;
  int ledFaultPin;
  int buttonPin;
  const char* status;      // "idle" | "charging" | "fault"
  float energyKwh;
  unsigned long pressStartMs;
  bool pressActive;
  unsigned long lastPublishMs;
};

Port ports[2] = {
  { 1, 16, 17, 18, 32, "idle", 0.0f, 0, false, 0 },
  { 2, 19, 21, 22, 33, "idle", 0.0f, 0, false, 0 },
};

unsigned long lastLoopMs = 0;

void setStatus(Port &p, const char* newStatus) {
  if (strcmp(p.status, newStatus) == 0) return;
  Serial.printf("[port %d] %s -> %s\n", p.portId, p.status, newStatus);
  p.status = newStatus;
}

void setupWifi() {
  Serial.printf("Dang ket noi WiFi %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.print("\nWiFi OK, IP: ");
  Serial.println(WiFi.localIP());
}

void reconnectMqtt() {
  while (!mqtt.connected()) {
    Serial.print("Dang ket noi MQTT... ");
    String clientId = String("esp32-") + STATION_ID;
    if (mqtt.connect(clientId.c_str())) {
      Serial.println("OK");
    } else {
      Serial.printf("that bai, rc=%d, thu lai sau 1s\n", mqtt.state());
      delay(1000);
    }
  }
}

String isoTimestamp() {
  time_t now;
  time(&now);
  struct tm timeinfo;
  gmtime_r(&now, &timeinfo);
  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

void updateButton(Port &p, float currentTemp) {
  bool pressed = (digitalRead(p.buttonPin) == LOW);
  if (pressed && !p.pressActive) {
    p.pressActive = true;
    p.pressStartMs = millis();
  } else if (!pressed && p.pressActive) {
    p.pressActive = false;
    unsigned long heldMs = millis() - p.pressStartMs;
    bool safeTemp = isnan(currentTemp) || currentTemp < OVERHEAT_C;

    if (heldMs >= LONG_PRESS_MS) {
      setStatus(p, "fault");
    } else if (strcmp(p.status, "idle") == 0 && safeTemp) {
      setStatus(p, "charging");
      p.energyKwh = 0.0f;      // phiên sạc mới bắt đầu
    } else if (strcmp(p.status, "charging") == 0) {
      setStatus(p, "idle");
    } else if (strcmp(p.status, "fault") == 0 && safeTemp) {
      setStatus(p, "idle");    // nhấn ngắn để reset lỗi, chỉ khi đã hết nóng
    }
  }
}

void updateLed(Port &p) {
  digitalWrite(p.ledIdlePin,     strcmp(p.status, "idle") == 0);
  digitalWrite(p.ledChargingPin, strcmp(p.status, "charging") == 0);
  digitalWrite(p.ledFaultPin,    strcmp(p.status, "fault") == 0);
}

float currentPowerKw(const Port &p) {
  if (strcmp(p.status, "charging") != 0) return 0.0f;
  int raw = analogRead(POT_PIN);      // 0..4095
  return (raw / 4095.0f) * 22.0f;     // map sang 0..22 kW
}

void publishStatus(Port &p, float temperature) {
  StaticJsonDocument<256> doc;
  doc["stationId"] = STATION_ID;
  doc["portId"] = p.portId;
  doc["status"] = p.status;
  doc["powerKw"] = currentPowerKw(p);
  doc["energyKwh"] = p.energyKwh;
  if (isnan(temperature)) {
    doc["temperature"] = nullptr;
  } else {
    doc["temperature"] = temperature;
  }
  doc["timestamp"] = isoTimestamp();

  char payload[256];
  serializeJson(doc, payload);

  String topic = String("stations/") + STATION_ID + "/status";
  bool ok = mqtt.publish(topic.c_str(), payload);

  Serial.printf("[pub] %s -> %s : %s\n", topic.c_str(), ok ? "OK" : "FAIL", payload);
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

  setupWifi();
  configTime(0, 0, "pool.ntp.org");   // lấy giờ UTC thật cho field timestamp
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
}

void loop() {
  if (!mqtt.connected()) reconnectMqtt();
  mqtt.loop();

  unsigned long nowMs = millis();
  unsigned long deltaMs = nowMs - lastLoopMs;
  lastLoopMs = nowMs;

  float temperature = dht.readTemperature();
  if (isnan(temperature)) {
    Serial.println("[dht] doc nhiet do that bai");
  }

  for (auto &p : ports) {
    if (!isnan(temperature) && temperature >= OVERHEAT_C) {
      setStatus(p, "fault");   // cảnh báo quá nhiệt, bất kể đang idle hay charging
    }

    updateButton(p, temperature);
    updateLed(p);

    if (strcmp(p.status, "charging") == 0) {
      p.energyKwh += currentPowerKw(p) * (deltaMs / 3600000.0f);
    }

    if (nowMs - p.lastPublishMs >= PUBLISH_INTERVAL_MS) {
      p.lastPublishMs = nowMs;
      publishStatus(p, temperature);
    }
  }
}
