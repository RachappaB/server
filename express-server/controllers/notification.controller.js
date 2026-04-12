/**
 * controllers/notification.controller.js
 *
 * Handles all 4 admin-triggered notification types.
 *
 * POST /api/admin/notify/broadcast        Type 1: plain, all users
 * POST /api/admin/notify/simple           Type 2: plain, one user
 * POST /api/admin/notify/question         Type 3: YES/NO alarm (offline guard)
 * POST /api/admin/notify/input            Type 4: string input (persistent)
 * GET  /api/admin/notify/inputs           list input requests + responses
 * GET  /api/admin/notify/questions        list question requests + responses
 * GET  /api/admin/notify/devices          list all registered devices
 *
 * Offline timeout (Type 3):
 *   After sending a QUESTION FCM, a server-side timeout (default 45 s) is
 *   started. If the device has not responded by then, the server marks the
 *   answer as "offline" itself. This covers the case where the device is
 *   completely offline (no FCM delivery) or the FCM is delivered but the
 *   device never calls back.
 */

const pool           = require("../db");
const { randomUUID } = require("crypto");
const {
  sendBroadcast,
  sendSimple,
  sendQuestion,
  sendInputRequest,
  cacheToken,
  getCachedToken,
  invalidateToken,
  isTokenInvalid,
} = require("../fcm");

// ── Offline timeout for TYPE 3 ────────────────────────────────────────────────
// In-memory map: questionId → NodeJS Timeout handle.
// Cleared when the device calls /question/response before the deadline.
const offlineTimeouts = new Map();
const OFFLINE_TIMEOUT_MS = 45_000;   // 45 seconds

function armOfflineTimeout(questionId, deviceId) {
  // Clear any previous timer for this question (idempotent)
  clearOfflineTimeout(questionId);

  const handle = setTimeout(async () => {
    offlineTimeouts.delete(questionId);
    try {
      // Only mark offline if not already answered
      const existing = await pool.query(
        `SELECT answer FROM question_responses WHERE question_id = $1`,
        [questionId]
      );
      if (existing.rowCount === 0) {
        await pool.query(
          `
          INSERT INTO question_responses (question_id, device_id, answer, answered_at)
          VALUES ($1, $2, 'offline', NOW())
          ON CONFLICT (question_id) DO NOTHING
          `,
          [questionId, deviceId]
        );
        console.log(`⏰ Offline timeout fired for question=${questionId} device=${deviceId}`);
      }
    } catch (err) {
      console.error("Offline timeout DB write error:", err);
    }
  }, OFFLINE_TIMEOUT_MS);

  offlineTimeouts.set(questionId, handle);
}

function clearOfflineTimeout(questionId) {
  const h = offlineTimeouts.get(questionId);
  if (h) { clearTimeout(h); offlineTimeouts.delete(questionId); }
}

// Export so Question.controller can call this when a device responds
module.exports.clearOfflineTimeout = clearOfflineTimeout;

// ── Fast token lookup (cache → DB) ────────────────────────────────────────────
async function resolveToken(deviceId) {
  // 1. Check in-memory cache first (no DB round-trip)
  const cached = getCachedToken(deviceId);
  if (cached) return cached;

  // 2. Fall back to DB
  const result = await pool.query(
    `SELECT fcm_token FROM device_tokens WHERE device_id = $1`,
    [deviceId]
  );
  if (result.rowCount === 0) {
    const err = new Error(
      `No FCM token for '${deviceId}'. Device must open the app at least once.`
    );
    err.status = 404;
    throw err;
  }
  const token = result.rows[0].fcm_token;
  cacheToken(deviceId, token);   // warm the cache
  return token;
}

// ── Shared FCM send wrapper — handles invalid-token cleanup ──────────────────
async function sendFcmSafe(sendFn, deviceId, ...args) {
  try {
    return await sendFn(...args);
  } catch (err) {
    if (isTokenInvalid(err)) {
      // Token stale — purge cache and DB so the next register fixes it
      invalidateToken(deviceId);
      console.warn(`🗑  Purging stale FCM token for device=${deviceId}`);
      await pool.query(
        `DELETE FROM device_tokens WHERE device_id = $1`, [deviceId]
      ).catch(() => {});
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE 1 — broadcast to ALL users
// POST /api/admin/notify/broadcast
// Body: { title?, body }
// ─────────────────────────────────────────────────────────────────────────────
async function broadcast(req, res) {
  const { title, body } = req.body;
  if (!body?.trim()) {
    return res.status(400).json({ ok: false, error: "body is required" });
  }

  try {
    const msgId = await sendBroadcast(title, body);
    console.log(`✅ BROADCAST sent`);
    return res.json({ ok: true, type: "broadcast", fcm_msg_id: msgId });
  } catch (err) {
    console.error("broadcast error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE 2 — simple notification to one user
// POST /api/admin/notify/simple
// Body: { device_id, title?, body }
// ─────────────────────────────────────────────────────────────────────────────
async function simple(req, res) {
  const { device_id, title, body } = req.body;
  if (!device_id || !body?.trim()) {
    return res.status(400).json({ ok: false, error: "device_id and body are required" });
  }

  try {
    const token = await resolveToken(device_id);
    const msgId = await sendFcmSafe(sendSimple, device_id, token, title, body);
    console.log(`✅ SIMPLE → device=${device_id}`);
    return res.json({ ok: true, type: "simple", device_id, fcm_msg_id: msgId });
  } catch (err) {
    console.error("simple error:", err);
    return res.status(err.status || 500).json({ ok: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE 3 — YES/NO alarm with offline guard
// POST /api/admin/notify/question
// Body: { device_id, message, offline_timeout_ms? }
//
// Server flow:
//   1. Persist question row
//   2. Resolve FCM token (cache → DB, parallel-ish)
//   3. Send FCM
//   4. Arm server-side offline timeout (default 45 s)
//   If device responds before timeout → timeout is cancelled (in Question.controller)
// ─────────────────────────────────────────────────────────────────────────────
async function question(req, res) {
  const { device_id, message, offline_timeout_ms } = req.body;
  if (!device_id || !message?.trim()) {
    return res.status(400).json({ ok: false, error: "device_id and message are required" });
  }

  const timeoutMs = Math.min(
    Math.max(Number(offline_timeout_ms) || OFFLINE_TIMEOUT_MS, 10_000),
    300_000   // max 5 min
  );

  try {
    const questionId = `q_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

    // Parallel: persist + resolve token
    const [, token] = await Promise.all([
      pool.query(
        `INSERT INTO questions (question_id, device_id, message) VALUES ($1, $2, $3)`,
        [questionId, device_id, message]
      ),
      resolveToken(device_id),
    ]);

    // Send FCM
    let fcmMsgId;
    try {
      fcmMsgId = await sendFcmSafe(sendQuestion, device_id, token, questionId, message);
      // Update fcm_msg_id (fire-and-forget, non-blocking)
      pool.query(
        `UPDATE questions SET fcm_msg_id = $1 WHERE question_id = $2`,
        [fcmMsgId, questionId]
      ).catch(console.error);
    } catch (fcmErr) {
      console.error("FCM send failed for QUESTION:", fcmErr);
      return res.status(502).json({
        ok: false, error: "Question saved but FCM delivery failed",
        question_id: questionId, fcm_error: fcmErr.message,
      });
    }

    // Arm offline timeout — if device doesn't respond in time, auto-mark "offline"
    const actualTimeout = offline_timeout_ms ? timeoutMs : OFFLINE_TIMEOUT_MS;
    armOfflineTimeout(questionId, device_id);

    console.log(`✅ QUESTION → device=${device_id} q=${questionId} offline_timeout=${actualTimeout}ms`);
    return res.json({
      ok: true, type: "question",
      question_id: questionId, device_id,
      fcm_msg_id: fcmMsgId,
      offline_timeout_ms: actualTimeout,
    });
  } catch (err) {
    console.error("question error:", err);
    return res.status(err.status || 500).json({ ok: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE 4 — persistent string input
// POST /api/admin/notify/input
// Body: { device_id, message, hint? }
// ─────────────────────────────────────────────────────────────────────────────
async function input(req, res) {
  const { device_id, message, hint } = req.body;
  console.log(device_id)
  console.log(message);
  if (!device_id || !message?.trim()) {
    console.log("device_id and message are required")
    return res.status(400).json({ ok: false, error: "device_id and message are required" });
  }

  try {
    const inputId = `in_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    console.log(inputId)
    const [, token] = await Promise.all([
      pool.query(
        `INSERT INTO input_requests (input_id, device_id, message, hint)
         VALUES ($1, $2, $3, $4)`,
        [inputId, device_id, message, hint || null]
      ),
      resolveToken(device_id),
      
    ]);

    let fcmMsgId;
    try {
      fcmMsgId = await sendFcmSafe(sendInputRequest, device_id, token, inputId, message, hint);
      pool.query(
        `UPDATE input_requests SET fcm_msg_id = $1 WHERE input_id = $2`,
        [fcmMsgId, inputId]
      ).catch(console.error);
    } catch (fcmErr) {
      console.error("FCM send failed for INPUT_REQUEST:", fcmErr);
      return res.status(502).json({
        ok: false, error: "Input request saved but FCM delivery failed",
        input_id: inputId, fcm_error: fcmErr.message,
      });
    }

    console.log(`✅ INPUT_REQUEST → device=${device_id} input=${inputId}`);
    return res.json({
      ok: true, type: "input",
      input_id: inputId, device_id,
      fcm_msg_id: fcmMsgId,
    });
  } catch (err) {
    console.error("input error:", err);
    return res.status(err.status || 500).json({ ok: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// List helpers for admin panel
// ─────────────────────────────────────────────────────────────────────────────

async function listQuestions(req, res) {
  const { device_id, limit = 50 } = req.query;
  const params = [];
  let   where  = "";
  if (device_id) { where = "WHERE q.device_id = $1"; params.push(device_id); }
  params.push(Math.min(Number(limit) || 50, 200));
  try {
    const result = await pool.query(
      `SELECT q.question_id, q.device_id, q.message, q.sent_at,
              r.answer, r.answered_at,
              CASE WHEN r.answer IS NULL THEN 'pending'
                   WHEN r.answer = 'offline' THEN 'offline'
                   ELSE 'answered' END AS status
       FROM questions q
       LEFT JOIN question_responses r ON r.question_id = q.question_id
       ${where}
       ORDER BY q.sent_at DESC LIMIT $${params.length}`,
      params
    );
    return res.json({ ok: true, count: result.rowCount, data: result.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function listInputs(req, res) {
  const { device_id, limit = 50 } = req.query;
  const params = [];
  let   where  = "";
  if (device_id) { where = "WHERE ir.device_id = $1"; params.push(device_id); }
  params.push(Math.min(Number(limit) || 50, 200));
  try {
    const result = await pool.query(
      `SELECT ir.input_id, ir.device_id, ir.message, ir.hint, ir.sent_at,
              r.response, r.answered_at,
              CASE WHEN r.response IS NULL THEN 'pending' ELSE 'answered' END AS status
       FROM input_requests ir
       LEFT JOIN input_responses r ON r.input_id = ir.input_id
       ${where}
       ORDER BY ir.sent_at DESC LIMIT $${params.length}`,
      params
    );
    return res.json({ ok: true, count: result.rowCount, data: result.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function listDevices(req, res) {
  try {
    const result = await pool.query(
      `SELECT device_id, platform, registered_at, updated_at
       FROM device_tokens ORDER BY updated_at DESC`
    );
    return res.json({ ok: true, count: result.rowCount, devices: result.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = {
  broadcast,
  simple,
  question,
  input,
  listQuestions,
  listInputs,
  listDevices,
  clearOfflineTimeout,   // exported for Question.controller
};