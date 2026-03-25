const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const phoneController = require("../controllers/phone.v2.controller");

const { sendUploadNowToTopic } = require("../fcm");

// ─── Upload ───────────────────────────────────────────────────────────────────

router.post("/usage/day", asyncHandler(phoneController.uploadUsageDay));

// ✅ trigger upload now via FCM
router.post("/upload-now", asyncHandler(async (req, res) => {
  const msgId = await sendUploadNowToTopic();
  res.json({ ok: true, message: "✅ FCM Upload trigger sent", msgId });
}));

// ─── Devices ──────────────────────────────────────────────────────────────────

router.get("/devices", asyncHandler(phoneController.getAllDevices));

// ─── Static-segment routes FIRST (before /:device_id wildcards) ───────────────
//
// Express matches top-to-bottom. Any route with a fixed word after /usage/
// (like /usage/all) MUST come before /usage/:device_id, otherwise the wildcard
// swallows the request and the fixed route is never reached.

router.get("/usage/all", asyncHandler(phoneController.getAllUsage));

// ─── Unlock / notification report routes ──────────────────────────────────────
//
// These also have fixed segments after /:device_id so they must come before the
// plain /usage/:device_id catch-all for the same reason.
//
// Usage:
//   GET /usage/:device_id/unlock-report              (all time)
//   GET /usage/:device_id/unlock-report?days=7       (last 7 days)
//   GET /usage/:device_id/unlock-report?days=15      (last 15 days)
//   GET /usage/:device_id/unlock-report?from=2026-03-01&to=2026-03-15
//
//   GET /usage/:device_id/unlock-report/daily?days=7 (per-day breakdown)

router.get(
  "/usage/:device_id/unlock-report/daily",
  asyncHandler(phoneController.getUnlockReportDaily)
);

router.get(
  "/usage/:device_id/unlock-report",
  asyncHandler(phoneController.getUnlockReport)
);

// ─── Generic device routes (wildcards — must come AFTER fixed-segment routes) ──

router.get("/usage/:device_id", asyncHandler(phoneController.getUsageByDeviceId));

// ─── Date-based routes ────────────────────────────────────────────────────────

router.get(
  "/usage/day/:device_id/:date",
  asyncHandler(phoneController.getUsageByDeviceAndDate)
);

// ─── Download routes ──────────────────────────────────────────────────────────

router.get("/download/last24/:device_id", asyncHandler(phoneController.downloadLast24));
router.get("/download/all/:device_id",    asyncHandler(phoneController.downloadAllForDevice));
router.get(
  "/download/day/:device_id/:date",
  asyncHandler(phoneController.downloadUsageByDate)
);

// ─── Legacy / kept for compatibility ─────────────────────────────────────────

router.get("/usage/last24/:device_id", asyncHandler(phoneController.getLast24Hours));

module.exports = router;