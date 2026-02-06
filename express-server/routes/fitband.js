const express = require("express");
const router = express.Router();

const {
  saveMotionData,
  getBucketByDay,
  getTaskHistory,
  getDailySummary,
  getMotionData
} = require("../controllers/fitbandController");

// ================= DEVICE =================

// ESP32 → upload bucket data
router.post("/", saveMotionData);

// ================= DASHBOARD =================

// Bucket analytics by day
router.get("/bucket-day", getBucketByDay);

// Task history
router.get("/tasks", getTaskHistory);

// Daily summary
router.get("/daily-summary", getDailySummary);

// Motion logs for dashboard UI
router.get("/motion", getMotionData);

module.exports = router;
