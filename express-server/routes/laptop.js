const express = require("express");
const router = express.Router();

const {
  receiveLaptopData,
  getLatestLaptopData,
  getLaptopDevices,
  getLaptopUsageByDate,
  downloadLaptopUsageByDate
} = require("../controllers/laptopcontrol");

// ============================
// AGENT ROUTES
// ============================

// Agent push endpoint
router.post("/push", receiveLaptopData);

// Testing endpoint
router.get("/latest", getLatestLaptopData);

// ============================
// DASHBOARD ROUTES
// ============================

// list devices
router.get("/devices", getLaptopDevices);

// fetch one day
router.get("/usage/day/:device_name/:date", getLaptopUsageByDate);

// download one day
router.get("/download/day/:device_name/:date", downloadLaptopUsageByDate);

module.exports = router;
