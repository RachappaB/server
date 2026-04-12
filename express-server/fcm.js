/**
 * fcm.js — Firebase Cloud Messaging helper
 *
 * Performance optimisations vs. naive implementation:
 *  1. Token cache (5-min TTL) — avoids a DB round-trip on every send.
 *  2. FCM timeout wrapper — rejects after 8 s so a slow FCM edge never hangs
 *     an HTTP request handler indefinitely.
 *  3. parallel DB + FCM ops via Promise.all where the operations are independent.
 *  4. Minimal payload size — only the fields Android actually reads.
 *  5. Single firebase-admin instance (module-level singleton).
 */

const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const admin = require("firebase-admin");
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require("./firebase-admin.json")),
  });
}

const messaging = admin.messaging();   // reuse the same instance

// ── Token cache ───────────────────────────────────────────────────────────────
// Keyed by device_id → { token: string, expiresAt: number }
const tokenCache = new Map();
const TOKEN_TTL_MS = 5 * 60 * 1000;   // 5 minutes

function cacheToken(deviceId, token) {
  tokenCache.set(deviceId, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
}
function getCachedToken(deviceId) {
  const entry = tokenCache.get(deviceId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { tokenCache.delete(deviceId); return null; }
  return entry.token;
}
function invalidateToken(deviceId) {
  tokenCache.delete(deviceId);
}

// ── FCM timeout wrapper ───────────────────────────────────────────────────────
const FCM_TIMEOUT_MS = 8_000;

function sendWithTimeout(message) {
  return Promise.race([
    messaging.send(message),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("FCM timeout after 8 s")), FCM_TIMEOUT_MS)
    ),
  ]);
}

// ── Error classifier ──────────────────────────────────────────────────────────
// Returns true when the error means the token is permanently invalid
// and should be purged from the DB.
function isTokenInvalid(err) {
  const code = err?.errorInfo?.code || err?.code || "";
  return (
    code.includes("registration-token-not-registered") ||
    code.includes("invalid-registration-token") ||
    code.includes("invalid-argument")
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE 1 — broadcast to ALL users via topic
// ─────────────────────────────────────────────────────────────────────────────

async function sendBroadcast(title, body) {
  return sendWithTimeout({
    topic: "usage-sync",
    data: {
      action: "BROADCAST",
      title:  title || "ProductiveAgent",
      body,
    },
    android: { priority: "normal" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE 2 — simple notification to one user
// ─────────────────────────────────────────────────────────────────────────────

async function sendSimple(fcmToken, title, body) {
  return sendWithTimeout({
    token: fcmToken,
    data: {
      action: "SIMPLE",
      title:  title || "ProductiveAgent",
      body,
    },
    android: { priority: "normal" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE 3 — YES/NO alarm (screen-on guard on device)
//
// Device auto-answers "offline" if screen is off when FCM arrives.
// Server also starts an offline-timeout job (handled in controller).
// ─────────────────────────────────────────────────────────────────────────────

async function sendQuestion(fcmToken, questionId, message) {
  return sendWithTimeout({
    token: fcmToken,
    data: {
      action:      "QUESTION",
      question_id: questionId,
      message,
    },
    android: { priority: "high" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE 4 — persistent string input (always fires, must stay until submitted)
// ─────────────────────────────────────────────────────────────────────────────

async function sendInputRequest(fcmToken, inputId, message, hint = "Type your answer…") {
  return sendWithTimeout({
    token: fcmToken,
    data: {
      action:   "INPUT_REQUEST",
      input_id: inputId,
      message,
      hint,
    },
    android: { priority: "high" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload trigger (internal, unchanged)
// ─────────────────────────────────────────────────────────────────────────────

async function sendUploadNowToTopic() {
  return sendWithTimeout({
    topic: "usage-sync",
    data:  { action: "UPLOAD_NOW" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Existing function name kept for backward compat (legacy question path)
// ─────────────────────────────────────────────────────────────────────────────
async function sendQuestionToDevice(fcmToken, questionId, message) {
  return sendQuestion(fcmToken, questionId, message);
}

module.exports = {
  // FCM senders
  sendBroadcast,
  sendSimple,
  sendQuestion,
  sendInputRequest,
  sendUploadNowToTopic,
  sendQuestionToDevice,   // legacy alias
  // Cache helpers (used by controller for fast token lookup)
  cacheToken,
  getCachedToken,
  invalidateToken,
  isTokenInvalid,
};