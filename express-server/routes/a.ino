/**************** DEVICE ****************/
#define DEVICE_ID "ESP32_E1"
#define SERVER_URL "https://data.sunita.space/api/embedded/data"

/**************** TIMING ****************/
#define GPS_BOOT_WINDOW   60000
#define GPS_READ_WINDOW   8000
#define SLEEP_SECONDS     30
#define WIFI_TIMEOUT      10000

/**************** I2C ****************/
#include <Wire.h>
#define SDA_PIN 21
#define SCL_PIN 22
#define TCA_ADDR 0x70

/**************** WIFI ****************/
#include <WiFi.h>
#include <WiFiMulti.h>
WiFiMulti wifiMulti;

/**************** NTP ****************/
#include <time.h>

/**************** STORAGE ****************/
#include <Preferences.h>
Preferences prefs;

/**************** HTTP ****************/
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

/**************** GPS ****************/
#include <TinyGPSPlus.h>
TinyGPSPlus gps;
HardwareSerial GPS(2);

/**************** MPU6050 ****************/
#define MPU_ADDR 0x68
#define ACCEL_XOUT_H 0x3B
#define PWR_MGMT_1 0x6B

#define MPU_SAMPLES 10
#define MPU_DELAY_US 2000

/**************** MAX30102 ****************/
#include <MAX30105.h>
MAX30105 max3010;

/**************** TEMP (Optional) ****************/
#include <OneWire.h>
#include <DallasTemperature.h>
#define ONE_WIRE_BUS 4
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensor(&oneWire);

/**************** GLOBAL CACHE ****************/
double lastLat = 0;
double lastLon = 0;
bool hadFixBefore = false;

/**************** MPU STRUCT ****************/
struct MPUFrame {
  int16_t ax, ay, az;
  int16_t gx, gy, gz;
};

MPUFrame mpuData[MPU_SAMPLES];
int16_t mpuPacked[MPU_SAMPLES * 6];

/**************** TCA SELECT ****************/
void tcaSelect(uint8_t ch) {
  Wire.beginTransmission(TCA_ADDR);
  Wire.write(1 << ch);
  Wire.endTransmission();
}

/**************** WIFI CONNECT ****************/
bool connectWiFi() {

  WiFi.mode(WIFI_STA);

  wifiMulti.addAP("iot", "password");
  wifiMulti.addAP("MK 206-207-2.4G", "206207000");
  wifiMulti.addAP("ACTFIBERNET", "act12345");

  unsigned long start = millis();

  while (wifiMulti.run() != WL_CONNECTED) {
    delay(300);
    if (millis() - start > WIFI_TIMEOUT) {
      Serial.println("WiFi timeout");
      return false;
    }
  }

  Serial.println("WiFi connected");
  return true;
}

/**************** NTP SYNC ****************/
void syncTime() {

  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  struct tm timeinfo;
  for (int i = 0; i < 20; i++) {
    if (getLocalTime(&timeinfo)) {
      Serial.println("NTP synced");
      return;
    }
    delay(500);
  }

  Serial.println("NTP failed");
}

/**************** GPS ACQUIRE ****************/
bool acquireGPS(uint32_t windowMs) {

  unsigned long start = millis();

  while (millis() - start < windowMs) {

    while (GPS.available()) {
      gps.encode(GPS.read());
    }

    if (gps.location.isValid()) {

      lastLat = gps.location.lat();
      lastLon = gps.location.lng();
      hadFixBefore = true;

      prefs.putDouble("lat", lastLat);
      prefs.putDouble("lon", lastLon);
      prefs.putBool("fix", true);

      Serial.println("GPS FIX OK");
      return true;
    }

    delay(10);
  }

  Serial.println("GPS NO FIX");
  return false;
}

/**************** MPU READ ****************/
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

/**************** PACK MPU ****************/
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

/**************** SEND DATA ****************/
void sendToServer(bool gpsFix,
                  uint32_t ir,
                  uint32_t red,
                  float temp) {

  if (WiFi.status() != WL_CONNECTED) {
    if (!connectWiFi()) return;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, SERVER_URL)) return;

  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  StaticJsonDocument<4096> doc;

  doc["d"] = DEVICE_ID;

  /* ---------- MPU ---------- */
  JsonArray mpuArr = doc.createNestedArray("mpu");
  for (int i = 0; i < 60; i++) {
    mpuArr.add(mpuPacked[i]);
  }

  /* ---------- GPS ---------- */
  JsonArray gpsArr = doc.createNestedArray("gps");

  double lat=0, lon=0, spd=0, alt=0;
  int sats=0;
  double hdop=99;

  if (gps.location.isValid() || hadFixBefore) {

    lat = lastLat;
    lon = lastLon;

    if (gps.speed.isValid()) spd = gps.speed.mps();
    if (gps.altitude.isValid()) alt = gps.altitude.meters();
    if (gps.satellites.isValid()) sats = gps.satellites.value();
    if (gps.hdop.isValid()) hdop = gps.hdop.hdop();
  }

  gpsArr.add(lat);
  gpsArr.add(lon);
  gpsArr.add(spd);
  gpsArr.add(alt);
  gpsArr.add(sats);
  gpsArr.add(hdop);

  /* ---------- BIO ---------- */
  JsonArray bioArr = doc.createNestedArray("bio");
  bioArr.add(ir);
  bioArr.add(red);
  bioArr.add(temp);

  /* ---------- TIME ---------- */
  time_t now;
  time(&now);
  doc["ts"] = (uint32_t)now;

  String payload;
  serializeJson(doc, payload);

  int code = http.POST(payload);

  Serial.print("POST CODE: ");
  Serial.println(code);

  http.end();
}

/**************** SETUP ****************/
void setup() {

  Serial.begin(115200);

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000); // safer for multiplexer

  /* GPS UART */
  GPS.begin(9600, SERIAL_8N1, 16, 17);

  /* Preferences */
  prefs.begin("gpscache", false);
  lastLat = prefs.getDouble("lat", 0);
  lastLon = prefs.getDouble("lon", 0);
  hadFixBefore = prefs.getBool("fix", false);

  /* WiFi + NTP */
  connectWiFi();
  syncTime();

  /* -------- MPU INIT -------- */
  tcaSelect(1);

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(PWR_MGMT_1);
  Wire.write(0x00);
  Wire.endTransmission();

  /* -------- MAX30102 INIT -------- */
  tcaSelect(2);

  if (!max3010.begin(Wire)) {
    Serial.println("MAX30102 NOT FOUND");
  } else {
    max3010.setup();
    max3010.setPulseAmplitudeRed(0x1F);
    max3010.setPulseAmplitudeIR(0x1F);
    max3010.setPulseAmplitudeGreen(0);
  }

  /* -------- TEMP -------- */
  tempSensor.begin();

  /* -------- FIRST GPS LOCK -------- */
  if (!hadFixBefore) {
    Serial.println("Waiting initial GPS fix...");
    acquireGPS(GPS_BOOT_WINDOW);
  }
}

/**************** LOOP ****************/
void loop() {

  bool gpsFix = acquireGPS(GPS_READ_WINDOW);

  /* -------- MPU SAMPLE -------- */
  tcaSelect(1);

  for (int i = 0; i < MPU_SAMPLES; i++) {
    readMPUBurst(mpuData[i]);
    delayMicroseconds(MPU_DELAY_US);
  }

  packMPU();

  /* -------- MAX30102 -------- */
  tcaSelect(2);
  uint32_t ir = max3010.getIR();
  uint32_t red = max3010.getRed();

  /* -------- TEMP -------- */
  tempSensor.requestTemperatures();
  float temp = tempSensor.getTempCByIndex(0);

  /* -------- SEND -------- */
  sendToServer(gpsFix, ir, red, temp);

  Serial.println("Sleeping...");

  esp_sleep_enable_timer_wakeup(SLEEP_SECONDS * 1000000ULL);
  esp_deep_sleep_start();
}
