const express = require("express");
const router = express.Router();

const {
  saveMotionData,
  getAlarm,
  createAlarm,
  deleteAlarm,
  getMotionLogs,
  ackAlarm
} = require("../controllers/fitbandController");

// ================= DEVICE =================

// ESP32 → upload bucket
router.post("/", saveMotionData);

// ESP32 → fetch alarm queue
router.get("/alarm", getAlarm);

// ESP32 → acknowledge alarm
router.post("/alarm/ack", ackAlarm);

// ================= DASHBOARD =================

// Web → view motion
router.get("/motion", getMotionLogs);

// Web → create alarm
router.post("/alarm", createAlarm);

// Web → delete alarm
router.delete("/alarm/:id", deleteAlarm);

module.exports = router;
