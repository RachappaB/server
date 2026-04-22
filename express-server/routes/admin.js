/**
 * routes/admin.js
 *
 * All routes require x-api-key header matching ADMIN_API_KEY env var.
 *
 * Notification types:
 *   POST /api/admin/notify/broadcast     Type 1: plain, ALL users
 *   POST /api/admin/notify/simple        Type 2: plain, one user
 *   POST /api/admin/notify/question      Type 3: YES/NO alarm + offline guard
 *   POST /api/admin/notify/input         Type 4: string input, persistent
 *
 * List/read:
 *   GET  /api/admin/notify/questions     all question requests + responses
 *   GET  /api/admin/notify/inputs        all input requests + responses
 *   GET  /api/admin/notify/devices       all registered devices
 *
 * Legacy (kept for backward compat):
 *   POST /api/admin/question/send
 *   GET  /api/admin/question/responses
 *   GET  /api/admin/devices
 */

const express      = require("express");
const router       = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const adminAuth    = require("../middleware/adminAuth");
const notifCtrl    = require("../controllers/notification.controller");
const questionCtrl = require("../controllers/Question.controller");

router.use(adminAuth);

// ─── Notification dispatch ────────────────────────────────────────────────────
router.post("/notify/broadcast", asyncHandler(notifCtrl.broadcast));
router.post("/notify/simple",    asyncHandler(notifCtrl.simple));
router.post("/notify/question",  asyncHandler(notifCtrl.question));
router.post("/notify/input",     asyncHandler(notifCtrl.input));

// ─── Read / list ──────────────────────────────────────────────────────────────
router.get("/notify/questions",  asyncHandler(notifCtrl.listQuestions));
router.get("/notify/inputs",     asyncHandler(notifCtrl.listInputs));
router.get("/notify/devices",    asyncHandler(notifCtrl.listDevices));

// ─── Legacy ───────────────────────────────────────────────────────────────────
router.post("/question/send",       asyncHandler(questionCtrl.sendQuestion));
router.get( "/question/responses",  asyncHandler(questionCtrl.getResponses));
router.get( "/devices",             asyncHandler(questionCtrl.listDevices));

module.exports = router;