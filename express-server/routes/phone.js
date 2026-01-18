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

module.exports = router;
