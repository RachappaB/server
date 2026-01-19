const express = require("express");
const router = express.Router();

const {
  insertData,
  getLatest,

  getEmbeddedDevices,
  getEmbeddedUsageByDate,
  downloadEmbeddedUsageByDate
} = require("../controllers/embeddedController");

// Test endpoint
router.get("/", (req, res) => {
  res.json({ ok: true, message: "Embedded Device API Endpoint" });
});

// Agent push
router.post("/data", insertData);

// Latest test
router.get("/latest", getLatest);

// ============================
// DASHBOARD ROUTES
// ============================

// list devices
router.get("/devices", getEmbeddedDevices);

// fetch one day
router.get("/usage/day/:device_id/:date", getEmbeddedUsageByDate);

// download one day
router.get("/download/day/:device_id/:date", downloadEmbeddedUsageByDate);

module.exports = router;
