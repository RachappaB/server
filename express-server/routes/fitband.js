const express = require("express");
const router = express.Router();

const {
  saveMotionData,
  getBucketByDay,
  getTaskHistory,
  getDailySummary
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

module.exports = router;
