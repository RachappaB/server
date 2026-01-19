const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const phoneController = require("../controllers/phone.controller");

const { sendUploadNowToTopic } = require("../fcm");

// existing routes...
router.post("/usage/day", asyncHandler(phoneController.uploadUsageDay));
router.get("/usage/all", asyncHandler(phoneController.getAllUsage));
router.get("/usage/:device_id", asyncHandler(phoneController.getUsageByDeviceId));



// ✅ trigger upload now via FCM
router.post("/upload-now", asyncHandler(async (req, res) => {
  const msgId = await sendUploadNowToTopic();
  res.json({ ok: true, message: "✅ FCM Upload trigger sent", msgId });
}));



// ==============================
// NEW DASHBOARD ROUTES
// ==============================

// list all phone devices
router.get("/devices", asyncHandler(phoneController.getAllDevices));

// last 24 hours usage (json)
router.get("/usage/last24/:device_id", asyncHandler(phoneController.getLast24Hours));

// download last 24 hours
router.get("/download/last24/:device_id", asyncHandler(phoneController.downloadLast24));

// download ALL data for one device
router.get("/download/all/:device_id", asyncHandler(phoneController.downloadAllForDevice));
// ======================
// DATE BASED ROUTES
// ======================

router.get(
  "/usage/day/:device_id/:date",
  asyncHandler(phoneController.getUsageByDeviceAndDate)
);

router.get(
  "/download/day/:device_id/:date",
  asyncHandler(phoneController.downloadUsageByDate)
);


module.exports = router;
