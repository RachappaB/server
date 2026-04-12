/**
 * middleware/adminAuth.js
 *
 * Protects admin routes with a static API key stored in .env:
 *   ADMIN_API_KEY=your_long_random_secret_here
 *
 * Usage in a route file:
 *   const adminAuth = require("../middleware/adminAuth");
 *   router.post("/send", adminAuth, asyncHandler(ctrl.sendQuestion));
 *
 * The caller must pass the key in the request header:
 *   x-api-key: your_long_random_secret_here
 */

function adminAuth(req, res, next) {
  const key = req.headers["x-api-key"];

  if (!process.env.ADMIN_API_KEY) {
    console.error("❌ ADMIN_API_KEY is not set in environment — admin routes are locked");
    return res.status(503).json({ ok: false, error: "Admin API not configured" });
  }

  if (!key || key !== process.env.ADMIN_API_KEY) {
    console.warn(`🚫 Unauthorized admin request from ${req.ip}`);
    return res.status(401).json({ ok: false, error: "Invalid or missing x-api-key header" });
  }

  next();
}

module.exports = adminAuth;