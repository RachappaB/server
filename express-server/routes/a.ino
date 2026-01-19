/************************************************************
 * DEVICE CONFIG
 ************************************************************/
#define DEVICE_ID "ESP32_E1"
#define SERVER_URL "https://data.sunita.space/api/embedded/data"

/************************************************************
 * WIFI
 ************************************************************/
#include <WiFi.h>
#include <WiFiMulti.h>
WiFiMulti wifiMulti;

/************************************************************
 * HTTP + JSON
 ************************************************************/
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

/************************************************************
 * DISPLAY
 ************************************************************/
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define OLED_ADDR 0x3C
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

/************************************************************
 * SENSOR LIBRARIES
 ************************************************************/
#include <Wire.h>
#include <TinyGPSPlus.h>
#include <MAX30105.h>
#include <OneWire.h>
#include <DallasTemperature.h>

/************************************************************
 * CONFIG
 ************************************************************/
#define SDA_PIN 21
#define SCL_PIN 22
#define ONE_WIRE_BUS 4
#define TCA_ADDR 0x70

#define MPU_ADDR 0x68
#define PWR_MGMT_1 0x6B
#define ACCEL_XOUT_H 0x3B

#define MPU_SAMPLES 10
#define MPU_DELAY_US 2000

/************************************************************
 * OBJECTS
 ************************************************************/
TinyGPSPlus gps;
HardwareSerial GPS(2);

MAX30105 max3010;
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensor(&oneWire);

/************************************************************
 * MPU STRUCT
 ************************************************************/
struct MPUFrame {
  int16_t ax, ay, az;
  int16_t gx, gy, gz;
};

MPUFrame mpuData[MPU_SAMPLES];

/* Packed MPU Buffer (60 values) */
int16_t mpuPacked[MPU_SAMPLES * 6];

/************************************************************
 * I2C MULTIPLEXER
 ************************************************************/
inline void tcaSelect(uint8_t ch) {
  Wire.beginTransmission(TCA_ADDR);
  Wire.write(1 << ch);
  Wire.endTransmission();
}

/************************************************************
 * MPU READ (BURST)
 ************************************************************/
void readMPUBurst(MPUFrame &f) {

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(ACCEL_XOUT_H);
  Wire.endTransmission(false);

  Wire.requestFrom(MPU_ADDR, (uint8_t)14);

  f.ax = Wire.read() << 8 | Wire.read();
  f.ay = Wire.read() << 8 | Wire.read();
  f.az = Wire.read() << 8 | Wire.read();

  Wire.read(); Wire.read(); // discard temp

  f.gx = Wire.read() << 8 | Wire.read();
  f.gy = Wire.read() << 8 | Wire.read();
  f.gz = Wire.read() << 8 | Wire.read();
}

/************************************************************
 * GPS SERVICE
 ************************************************************/
void serviceGPS(uint32_t durationMs) {

  uint32_t start = millis();

  while (millis() - start < durationMs) {
    while (GPS.available()) {
      gps.encode(GPS.read());
    }
    delay(1);
  }
}

/************************************************************
 * HIGH PRECISION GPS
 ************************************************************/
double getLatDouble() {
  if (!gps.location.isValid()) return 0;
  return gps.location.rawLat().deg +
         gps.location.rawLat().billionths / 1e9;
}

double getLonDouble() {
  if (!gps.location.isValid()) return 0;
  return gps.location.rawLng().deg +
         gps.location.rawLng().billionths / 1e9;
}

/************************************************************
 * OLED STATUS
 ************************************************************/
void showStatusOLED(float temp, uint32_t ir, bool gpsValid) {

  tcaSelect(0);

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.printf("Temp: %.1f C", temp);

  display.setCursor(0, 16);
  display.printf("IR: %lu", ir);

  display.setCursor(0, 32);
  display.printf("GPS: %s", gpsValid ? "FIX" : "NO FIX");

  display.display();
}

/************************************************************
 * WIFI CONNECT
 ************************************************************/
void connectWiFi() {

  WiFi.mode(WIFI_STA);

  wifiMulti.addAP("iot", "password");
  wifiMulti.addAP("MK 206-207-2.4G", "206207000");
  wifiMulti.addAP("ACTFIBERNET", "act12345");

  while (wifiMulti.run() != WL_CONNECTED) {
    delay(300);
  }

  Serial.println("WiFi Connected");
}

/************************************************************
 * PACK MPU INTO FLAT ARRAY
 ************************************************************/
void packMPU() {

  int idx = 0;

  for (int i = 0; i < MPU_SAMPLES; i++) {

    mpuPacked[idx++] = mpuData[i].ax;
    mpuPacked[idx++] = mpuData[i].ay;
    mpuPacked[idx++] = mpuData[i].az;

    mpuPacked[idx++] = mpuData[i].gx;
    mpuPacked[idx++] = mpuData[i].gy;
    mpuPacked[idx++] = mpuData[i].gz;
  }
}

/************************************************************
 * SEND DATA TO SERVER
 ************************************************************/
void sendToServer(
  bool gpsValid,
  float temp,
  uint32_t ir,
  uint32_t red
) {

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    return;
  }

  WiFiClientSecure client;
  client.setInsecure();   // Needed for Cloudflare tunnel

  HTTPClient http;

  if (!http.begin(client, SERVER_URL)) {
    Serial.println("HTTP begin failed");
    return;
  }

  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Connection", "keep-alive");

  StaticJsonDocument<3072> doc;

  doc["d"] = DEVICE_ID;

  /* MPU ARRAY (60 values) */
  JsonArray mpuArr = doc.createNestedArray("mpu");
  for (int i = 0; i < 60; i++) {
    mpuArr.add(mpuPacked[i]);
  }

  /* GPS ARRAY */
  JsonArray gpsArr = doc.createNestedArray("gps");

  if (gpsValid) {

    gpsArr.add(getLatDouble());
    gpsArr.add(getLonDouble());
    gpsArr.add(gps.speed.mps());
    gpsArr.add(gps.altitude.meters());
    gpsArr.add(gps.satellites.value());
    gpsArr.add(gps.hdop.hdop());

  } else {

    // GPS missing → send zero safely
    for (int i = 0; i < 6; i++) gpsArr.add(0);
  }

  /* BIO DATA */
  JsonArray bioArr = doc.createNestedArray("bio");

  bioArr.add(ir);
  bioArr.add(red);
  bioArr.add(temp);

  String payload;
  serializeJson(doc, payload);

  int httpCode = http.POST(payload);

  Serial.print("POST: ");
  Serial.println(httpCode);

  http.end();
}

/************************************************************
 * SETUP
 ************************************************************/
void setup() {

  Serial.begin(115200);

  Wire.begin(SDA_PIN, SCL_PIN);

  connectWiFi();

  /* OLED */
  tcaSelect(0);
  display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);

  /* MPU */
  tcaSelect(1);
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(PWR_MGMT_1);
  Wire.write(0x00);
  Wire.endTransmission();

  /* MAX30102 */
  tcaSelect(2);
  max3010.begin(Wire);
  max3010.setup();

  /* TEMP SENSOR */
  tempSensor.begin();

  /* GPS */
  GPS.begin(9600, SERIAL_8N1, 16, 17);
}

/************************************************************
 * LOOP
 ************************************************************/
void loop() {

  /* ---------- GPS ---------- */
  serviceGPS(1200);
  bool gpsValid = gps.location.isValid();

  /* ---------- MPU ---------- */
  tcaSelect(1);

  for (int i = 0; i < MPU_SAMPLES; i++) {
    readMPUBurst(mpuData[i]);
    delayMicroseconds(MPU_DELAY_US);
  }

  /* ---------- TEMP ---------- */
  tempSensor.requestTemperatures();
  float temp = tempSensor.getTempCByIndex(0);

  /* ---------- MAX ---------- */
  tcaSelect(2);
  uint32_t ir = max3010.getIR();
  uint32_t red = max3010.getRed();

  /* ---------- OLED ---------- */
  showStatusOLED(temp, ir, gpsValid);

  /* ---------- PACK + SEND ---------- */
  packMPU();

  sendToServer(
    gpsValid,
    temp,
    ir,
    red
  );

  delay(1000); // 1Hz send rate
}
