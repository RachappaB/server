/**
 * routes/phonev4.js
 *
 * Mount in server.js with:
 *   app.use("/api/phonev4", require("./routes/phonev4"));
 */

const express    = require("express");
const router     = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const ctrl       = require("../controllers/phone.v4.controller");

// ─── Upload (Android → Server) ────────────────────────────────────────────────
// POST /api/phonev4/profile/day
router.post("/profile/day", asyncHandler(ctrl.uploadProfileDay));

// ─── Admin / cross-device views (fixed segments first) ───────────────────────
// GET /api/phonev4/profile/all/devices
router.get("/profile/all/devices",     asyncHandler(ctrl.getAllV4Devices));

// GET /api/phonev4/profile/all/hidden-apps
router.get("/profile/all/hidden-apps", asyncHandler(ctrl.getAllHiddenApps));

// ─── Per-device routes ────────────────────────────────────────────────────────

// GET /api/phonev4/profile/:device_id/latest
router.get("/profile/:device_id/latest",  asyncHandler(ctrl.getLatestProfile));

// GET /api/phonev4/profile/:device_id/hidden-apps
router.get("/profile/:device_id/hidden-apps", asyncHandler(ctrl.getHiddenApps));

// GET /api/phonev4/profile/:device_id/switches[?days=7]
router.get("/profile/:device_id/switches", asyncHandler(ctrl.getProfileSwitches));

// GET /api/phonev4/profile/:device_id/day/:date
router.get("/profile/:device_id/day/:date", asyncHandler(ctrl.getProfileByDate));

// GET /api/phonev4/profile/:device_id   (all snapshots, newest first)
router.get("/profile/:device_id", asyncHandler(ctrl.getProfileByDevice));

module.exports = router;