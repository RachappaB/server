const express = require("express");
const router = express.Router();

const {
  registerDevice,
  uploadBucket,
  getBuckets,
  verifyDevice,
  getDevices,
  getUsageByDeviceAndDate,
  downloadUsageByDate
} = require("../controllers/extensionController");


/* ======================
 ROUTES
====================== */

router.post("/register", registerDevice);

router.post("/usage/bucket", uploadBucket);

router.get("/usage/:email", getBuckets);

router.post("/verify", verifyDevice);
// ============================
// DASHBOARD ROUTES
// ============================

router.get("/devices", getDevices);

router.get(
  "/usage/day/:device_id/:date",
  getUsageByDeviceAndDate
);

router.get(
  "/download/day/:device_id/:date",
  downloadUsageByDate
);


module.exports = router;
