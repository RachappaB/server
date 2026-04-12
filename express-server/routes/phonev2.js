/**
 * routes/phonev2.js  (updated — adds input/response endpoint)
 *
 * Diff from original:
 *   + POST /api/phonev2/input/response  — InputActivity POSTs submitted text here
 */

const express      = require("express");
const router       = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const phoneCtrl    = require("../controllers/phone.v2.controller");
const questionCtrl = require("../controllers/Question.controller");

const { sendUploadNowToTopic } = require("../fcm");

// ─── Device registration ──────────────────────────────────────────────────────
router.post("/device/register", asyncHandler(questionCtrl.registerDevice));

// ─── Question & input responses from Android ─────────────────────────────────
router.post("/question/response", asyncHandler(questionCtrl.submitResponse));
router.post("/input/response",    asyncHandler(questionCtrl.submitInputResponse));  // NEW

// ─── Usage upload ─────────────────────────────────────────────────────────────
router.post("/usage/day", asyncHandler(phoneCtrl.uploadUsageDay));

router.post("/upload-now", asyncHandler(async (req, res) => {
  const msgId = await sendUploadNowToTopic();
  res.json({ ok: true, message: "FCM upload trigger sent", msgId });
}));

// ─── Device / usage read routes ───────────────────────────────────────────────
router.get("/devices",    asyncHandler(phoneCtrl.getAllDevices));
router.get("/usage/all",  asyncHandler(phoneCtrl.getAllUsage));

router.get("/usage/:device_id/unlock-report/daily", asyncHandler(phoneCtrl.getUnlockReportDaily));
router.get("/usage/:device_id/unlock-report",       asyncHandler(phoneCtrl.getUnlockReport));
router.get("/usage/:device_id",                     asyncHandler(phoneCtrl.getUsageByDeviceId));
router.get("/usage/day/:device_id/:date",           asyncHandler(phoneCtrl.getUsageByDeviceAndDate));

router.get("/download/last24/:device_id",           asyncHandler(phoneCtrl.downloadLast24));
router.get("/download/all/:device_id",              asyncHandler(phoneCtrl.downloadAllForDevice));
router.get("/download/day/:device_id/:date",        asyncHandler(phoneCtrl.downloadUsageByDate));

router.get("/usage/last24/:device_id",              asyncHandler(phoneCtrl.getLast24Hours));

module.exports = router;