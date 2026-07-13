/**
 * ESP32 PetCare Gateway Firmware
 *
 * 기능:
 *   - 심박수 센서 (MAX30102) → HR
 *   - 체온 센서 (DS18B20)    → TEMP
 *   - 걸음수 센서 (MPU6050)  → STEPS
 *   - WiFi / WebSocket 서버  → 웹 대시보드와 통신
 *   - 홈카메라 (ESP32-CAM)   → MJPEG 스트리밍
 *
 * 통신 프로토콜:
 *   WebSerial (USB): 115200 baud, CSV 포맷
 *   WebSocket (WiFi): 포트 81, JSON/CSV
 *
 * 연결 방법:
 *   1. WiFi SSID/비밀번호 설정
 *   2. 웹 대시보드에서 WebSocket 연결
 *   3. 또는 USB 케이블로 WebSerial 연결
 */

#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>

// ============================================================
// WiFi 설정
// ============================================================
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// ============================================================
// 핀 정의
// ============================================================
#define HEART_SENSOR_PIN  34   // MAX30102 아날로그 입력 (실제는 I2C)
#define TEMP_SENSOR_PIN   32   // DS18B20 (OneWire)
#define STEP_SENSOR_PIN   35   // MPU6050 (I2C)
#define CAM_PIN           33   // ESP32-CAM 제어

// ============================================================
// 글로벌 변수
// ============================================================
WebServer server(80);
WebSocketsServer webSocket(81);

unsigned long lastSensorRead = 0;
const unsigned long SENSOR_INTERVAL = 2000; // 2초마다 센서 읽기

int heartRate = 0;
float temperature = 0.0;
int steps = 0;
int totalSteps = 0;
float calories = 0.0;
int walkMinutes = 0;

// ============================================================
// HTML 페이지 (웹 대시보드에서 ESP32 직접 접속용)
// ============================================================
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>ESP32 PetCare</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:sans-serif;background:#1a1a2e;color:#fff;padding:20px;text-align:center}
.card{background:#2d2d4e;padding:20px;border-radius:16px;margin:10px 0}
.value{font-size:32px;font-weight:800;color:#6c5ce7}.label{color:#999;font-size:14px}
.btn{padding:12px 24px;border:none;border-radius:12px;background:#6c5ce7;color:#fff;
font-size:16px;cursor:pointer;margin:4px}
.data-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
</style></head><body>
<h2>🐾 ESP32 PetCare Gateway</h2>
<div id="status" style="color:#4ade80">● 연결됨</div>
<div class="data-grid">
<div class="card"><div class="label">심장박동</div><div class="value" id="hr">--</div><div>BPM</div></div>
<div class="card"><div class="label">체온</div><div class="value" id="temp">--</div><div>°C</div></div>
<div class="card"><div class="label">걸음수</div><div class="value" id="steps">--</div><div>오늘</div></div>
<div class="card"><div class="label">칼로리</div><div class="value" id="cal">--</div><div>kcal</div></div>
</div>
<button class="btn" onclick="sendCmd('LED_ON')">LED 켜기</button>
<button class="btn" onclick="sendCmd('LED_OFF')">LED 끄기</button>
<p style="margin-top:20px;color:#666;font-size:12px">
WebSocket: ws://192.168.x.x:81</p>
<script>
var ws = new WebSocket('ws://'+location.hostname+':81');
ws.onmessage=function(e){
  var d=e.data.split(',');
  d.forEach(function(p){var kv=p.split(':');if(kv[0]=='HR')document.getElementById('hr').textContent=kv[1];
  if(kv[0]=='TEMP')document.getElementById('temp').textContent=kv[1];
  if(kv[0]=='STEPS')document.getElementById('steps').textContent=parseInt(kv[1]).toLocaleString();
  if(kv[0]=='CAL')document.getElementById('cal').textContent=kv[1];});
};
function sendCmd(cmd){ws.send('CMD:'+cmd);}
</script></body></html>
)rawliteral";

// ============================================================
// 센서 시뮬레이션 (실제 센서 연결 시 대체)
// ============================================================
void readSensors() {
  // ---- 실제 구현 시 아래 코드로 대체 ----
  // MAX30102: heartRate = readMAX30102();
  // DS18B20:  temperature = readDS18B20();
  // MPU6050:  steps = readMPU6050();

  // 시뮬레이션 데이터
  heartRate = random(65, 110);
  temperature = 36.5 + (random(0, 20) / 10.0);
  int newSteps = random(0, 5);
  steps += newSteps;
  totalSteps += newSteps;
  calories = totalSteps * 0.04;
  walkMinutes = totalSteps / 80;
}

// ============================================================
// 데이터 전송 포맷
// ============================================================
String buildSensorData() {
  String data = "HR:" + String(heartRate);
  data += ",TEMP:" + String(temperature, 1);
  data += ",STEPS:" + String(totalSteps);
  data += ",CAL:" + String(calories, 1);
  data += ",WALK:" + String(walkMinutes);
  return data;
}

// ============================================================
// WebSocket 이벤트
// ============================================================
void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t len) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.printf("[WS] Client %u connected\n", num);
      break;
    case WStype_DISCONNECTED:
      Serial.printf("[WS] Client %u disconnected\n", num);
      break;
    case WStype_TEXT: {
      String msg = String((char*)payload);
      Serial.println("[WS] Received: " + msg);

      // 명령 처리
      if (msg.startsWith("CMD:")) {
        String cmd = msg.substring(4);
        if (cmd == "LED_ON") {
          digitalWrite(LED_BUILTIN, HIGH);
        } else if (cmd == "LED_OFF") {
          digitalWrite(LED_BUILTIN, LOW);
        } else if (cmd == "CAM_START") {
          // ESP32-CAM 스트리밍 시작
        } else if (cmd == "CAM_STOP") {
          // ESP32-CAM 스트리밍 중지
        }
        webSocket.sendTXT(num, "ACK:" + cmd);
      }
      break;
    }
    default:
      break;
  }
}

// ============================================================
// HTTP 서버 라우트
// ============================================================
void setupHTTPServer() {
  server.on("/", []() {
    server.send(200, "text/html", INDEX_HTML);
  });

  server.on("/data", []() {
    String json = "{";
    json += "\"hr\":" + String(heartRate) + ",";
    json += "\"temp\":" + String(temperature, 1) + ",";
    json += "\"steps\":" + String(totalSteps) + ",";
    json += "\"cal\":" + String(calories, 1);
    json += "}";
    server.send(200, "application/json", json);
  });

  server.on("/cam", []() {
    server.send(200, "text/plain", "CAM stream at /cam/stream (MJPEG)");
  });

  server.begin();
  Serial.println("HTTP server started");
}

// ============================================================
// Setup
// ============================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n🐾 PetCare ESP32 Gateway");
  Serial.println("Firmware v1.0.0");

  // 핀 설정
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(HEART_SENSOR_PIN, INPUT);
  pinMode(TEMP_SENSOR_PIN, INPUT);
  pinMode(STEP_SENSOR_PIN, INPUT);

  // WiFi 연결
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("✅ WiFi connected: ");
  Serial.println(WiFi.localIP());

  // WebSocket 서버
  webSocket.begin();
  webSocket.onEvent(onWebSocketEvent);

  // HTTP 서버
  setupHTTPServer();

  // 시드 초기화
  randomSeed(analogRead(0));

  Serial.println("Ready!");
  Serial.print("WebSocket: ws://");
  Serial.print(WiFi.localIP());
  Serial.println(":81");
  Serial.print("Dashboard: http://");
  Serial.println(WiFi.localIP());
}

// ============================================================
// Loop
// ============================================================
void loop() {
  webSocket.loop();
  server.handleClient();

  unsigned long now = millis();
  if (now - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = now;

    readSensors();
    String data = buildSensorData();

    // USB 시리얼 출력
    Serial.println(data);

    // WebSocket 브로드캐스트
    webSocket.broadcastTXT(data);
  }

  // 작은 딜레이로 CPU 사용률 조절
  delay(10);
}
