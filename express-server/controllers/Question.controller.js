/**
 * controllers/Question.controller.js  (updated)
 *
 * Key change: when a device posts a YES/NO response, we cancel the server-side
 * offline timeout that was armed when the question was sent.
 */

const pool = require("../db");
const { sendQuestionToDevice } = require("../fcm");
const { randomUUID } = require("crypto");

// Import offline timeout canceller (lazy to avoid circular dep issues)
function clearOfflineTimeoutSafe(questionId) {
  try {
    const { clearOfflineTimeout } = require("./notification.controller");
    clearOfflineTimeout(questionId);
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/phonev2/device/register
// ─────────────────────────────────────────────────────────────────────────────
async function registerDevice(req, res) {
  const { device_id, fcm_token, platform = "android" } = req.body;
  if (!device_id || !fcm_token) {
    return res.status(400).json({ ok: false, error: "device_id and fcm_token are required" });
  }

  try {
    // Parallel: upsert device token + warm the in-memory token cache
    await pool.query(
      `INSERT INTO device_tokens (device_id, fcm_token, platform, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (device_id) DO UPDATE SET
         fcm_token  = EXCLUDED.fcm_token,
         platform   = EXCLUDED.platform,
         updated_at = NOW()`,
      [device_id, fcm_token, platform]
    );

    // Warm token cache immediately so the next FCM send is instant
    try {
      const { cacheToken } = require("../fcm");
      cacheToken(device_id, fcm_token);
    } catch (_) {}

    console.log(`✅ Device registered: ${device_id}`);
    return res.json({ ok: true, device_id });
  } catch (err) {
    console.error("registerDevice error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/phonev2/question/response
// Called by Android when user answers YES, NO — or auto-answers "offline".
// ─────────────────────────────────────────────────────────────────────────────
async function submitResponse(req, res) {
  const { device_id, question_id, answer, answered_at } = req.body;

  if (!device_id || !question_id || !answer) {
    return res.status(400).json({ ok: false, error: "device_id, question_id and answer are required" });
  }
  if (!["yes", "no", "offline"].includes(answer)) {
    return res.status(400).json({ ok: false, error: "answer must be 'yes', 'no' or 'offline'" });
  }

  // Cancel server-side offline timeout — device beat us to it
  clearOfflineTimeoutSafe(question_id);

  try {
    const qResult = await pool.query(
      `SELECT device_id FROM questions WHERE question_id = $1`,
      [question_id]
    );
    if (qResult.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "question_id not found" });
    }
    if (qResult.rows[0].device_id !== device_id) {
      return res.status(403).json({ ok: false, error: "question does not belong to this device" });
    }

    await pool.query(
      `INSERT INTO question_responses (question_id, device_id, answer, answered_at)
       VALUES ($1, $2, $3, $4::timestamptz)
       ON CONFLICT (question_id) DO UPDATE SET
         answer      = EXCLUDED.answer,
         answered_at = EXCLUDED.answered_at,
         received_at = NOW()`,
      [question_id, device_id, answer, answered_at || null]
    );

    console.log(`✅ Question response: device=${device_id} q=${question_id} answer=${answer}`);
    return res.json({ ok: true, question_id, answer });
  } catch (err) {
    console.error("submitResponse error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/phonev2/input/response
// Called by Android InputActivity when the user submits their text.
// ─────────────────────────────────────────────────────────────────────────────
async function submitInputResponse(req, res) {
  const { device_id, input_id, response, answered_at } = req.body;
  if (!device_id || !input_id || !response?.trim()) {
    return res.status(400).json({ ok: false, error: "device_id, input_id and response are required" });
  }

  try {
    const reqRow = await pool.query(
      `SELECT device_id FROM input_requests WHERE input_id = $1`, [input_id]
    );
    if (reqRow.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "input_id not found" });
    }
    if (reqRow.rows[0].device_id !== device_id) {
      return res.status(403).json({ ok: false, error: "input_id does not belong to this device" });
    }

    await pool.query(
      `INSERT INTO input_responses (input_id, device_id, response, answered_at)
       VALUES ($1, $2, $3, $4::timestamptz)
       ON CONFLICT (input_id) DO UPDATE SET
         response    = EXCLUDED.response,
         answered_at = EXCLUDED.answered_at,
         received_at = NOW()`,
      [input_id, device_id, response.trim(), answered_at || null]
    );

    console.log(`✅ Input response: device=${device_id} input=${input_id}`);
    return res.json({ ok: true, input_id });
  } catch (err) {
    console.error("submitInputResponse error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin helpers (legacy — kept for backward compat)
// ─────────────────────────────────────────────────────────────────────────────
async function sendQuestion(req, res) {
  // Delegate to new notification controller
  return require("./notification.controller").question(req, res);
}

async function getResponses(req, res) {
  return require("./notification.controller").listQuestions(req, res);
}

async function listDevices(req, res) {
  return require("./notification.controller").listDevices(req, res);
}

module.exports = {
  registerDevice,
  submitResponse,
  submitInputResponse,
  sendQuestion,
  getResponses,
  listDevices,
};