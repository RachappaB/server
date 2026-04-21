// /**
//  * routes/admin.js
//  *
//  * All routes require x-api-key header matching ADMIN_API_KEY env var.
//  *
//  * Notification types:
//  *   POST /api/admin/notify/broadcast     Type 1: plain, ALL users
//  *   POST /api/admin/notify/simple        Type 2: plain, one user
//  *   POST /api/admin/notify/question      Type 3: YES/NO alarm + offline guard
//  *   POST /api/admin/notify/input         Type 4: string input, persistent
//  *
//  * List/read:
//  *   GET  /api/admin/notify/questions     all question requests + responses
//  *   GET  /api/admin/notify/inputs        all input requests + responses
//  *   GET  /api/admin/notify/devices       all registered devices
//  *
//  * Legacy (kept for backward compat):
//  *   POST /api/admin/question/send
//  *   GET  /api/admin/question/responses
//  *   GET  /api/admin/devices
//  */

// const express      = require("express");
// const router       = express.Router();
// const asyncHandler = require("../utils/asyncHandler");
// const adminAuth    = require("../middleware/adminAuth");
// const notifCtrl    = require("../controllers/notification.controller");
// const questionCtrl = require("../controllers/Question.controller");

// router.use(adminAuth);

// // ─── Notification dispatch ────────────────────────────────────────────────────
// router.post("/notify/broadcast", asyncHandler(notifCtrl.broadcast));
// router.post("/notify/simple",    asyncHandler(notifCtrl.simple));
// router.post("/notify/question",  asyncHandler(notifCtrl.question));
// router.post("/notify/input",     asyncHandler(notifCtrl.input));

// // ─── Read / list ──────────────────────────────────────────────────────────────
// router.get("/notify/questions",  asyncHandler(notifCtrl.listQuestions));
// router.get("/notify/inputs",     asyncHandler(notifCtrl.listInputs));
// router.get("/notify/devices",    asyncHandler(notifCtrl.listDevices));

// // ─── Legacy ───────────────────────────────────────────────────────────────────
// router.post("/question/send",       asyncHandler(questionCtrl.sendQuestion));
// router.get( "/question/responses",  asyncHandler(questionCtrl.getResponses));
// router.get( "/devices",             asyncHandler(questionCtrl.listDevices));

// module.exports = router;




/**
 * routes/admin.js
 */
const express      = require("express");
const router       = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const adminAuth    = require("../middleware/adminAuth");
const notifCtrl    = require("../controllers/notification.controller");
const questionCtrl = require("../controllers/Question.controller");
const campCtrl     = require("../controllers/campaign.controller");

router.use(adminAuth);

// Dashboard
router.get("/stats",                                       asyncHandler(campCtrl.getDashboardStats));

// Audiences
router.get   ("/audiences",                                asyncHandler(campCtrl.listAudiences));
router.post  ("/audiences",                                asyncHandler(campCtrl.createAudience));
router.patch ("/audiences/:id",                            asyncHandler(campCtrl.updateAudience));
router.delete("/audiences/:id",                            asyncHandler(campCtrl.deleteAudience));
router.get   ("/audiences/:id/preview",                    asyncHandler(campCtrl.previewAudience));
router.get   ("/segment-filters",                          asyncHandler(campCtrl.listSegmentFilters));

// Templates
router.get   ("/templates",                                asyncHandler(campCtrl.listTemplates));
router.post  ("/templates",                                asyncHandler(campCtrl.createTemplate));
router.patch ("/templates/:id",                            asyncHandler(campCtrl.updateTemplate));
router.delete("/templates/:id",                            asyncHandler(campCtrl.deleteTemplate));

// Campaigns
router.get   ("/campaigns",                                asyncHandler(campCtrl.listCampaigns));
router.post  ("/campaigns",                                asyncHandler(campCtrl.createCampaign));
router.get   ("/campaigns/:id",                            asyncHandler(campCtrl.getCampaign));
router.patch ("/campaigns/:id",                            asyncHandler(campCtrl.updateCampaign));
router.delete("/campaigns/:id",                            asyncHandler(campCtrl.deleteCampaign));
router.post  ("/campaigns/:id/run",                        asyncHandler(campCtrl.runCampaignNow));
router.post  ("/campaigns/:id/clone",                      asyncHandler(campCtrl.cloneCampaign));
router.get   ("/campaigns/:id/runs",                       asyncHandler(campCtrl.getCampaignRuns));
router.get   ("/campaigns/:id/responses",                  asyncHandler(campCtrl.getCampaignResponses));

// Devices
router.get   ("/devices",                                  asyncHandler(campCtrl.listDevices));
router.patch ("/devices/:device_id/metadata",              asyncHandler(campCtrl.updateDeviceMetadata));
router.post  ("/devices/:device_id/groups",                asyncHandler(campCtrl.addToGroup));
router.delete("/devices/:device_id/groups/:group",         asyncHandler(campCtrl.removeFromGroup));

// Groups
router.get   ("/groups",                                   asyncHandler(campCtrl.listGroups));
router.get   ("/groups/:group/members",                    asyncHandler(campCtrl.getGroupMembers));
router.delete("/groups/:group",                            asyncHandler(campCtrl.deleteGroup));

// Legacy one-off sends (unchanged)
router.post("/notify/broadcast",   asyncHandler(notifCtrl.broadcast));
router.post("/notify/simple",      asyncHandler(notifCtrl.simple));
router.post("/notify/question",    asyncHandler(notifCtrl.question));
router.post("/notify/input",       asyncHandler(notifCtrl.input));
router.get ("/notify/questions",   asyncHandler(notifCtrl.listQuestions));
router.get ("/notify/inputs",      asyncHandler(notifCtrl.listInputs));
router.get ("/notify/devices",     asyncHandler(notifCtrl.listDevices));
router.post("/question/send",      asyncHandler(questionCtrl.sendQuestion));
router.get ("/question/responses", asyncHandler(questionCtrl.getResponses));

module.exports = router;