/**
 * routes/phonev2_input.js  — add to existing phonev2.js router
 *
 * Add these two lines to routes/phonev2.js:
 *
 *   const inputCtrl = require("../controllers/input.controller");
 *   router.post("/input/response", asyncHandler(inputCtrl.submitInputResponse));
 */

// ─────────────────────────────────────────────────────────────────────────────
// controllers/input.controller.js
// ─────────────────────────────────────────────────────────────────────────────

const pool = require("../db");

/**
 * POST /api/phonev2/input/response
 *
 * Called by InputActivity on Android when the user submits their text response.
 * Body: { device_id, input_id, response, answered_at }
 */
async function submitInputResponse(req, res) {
  const { device_id, input_id, response, answered_at } = req.body;

  if (!device_id || !input_id || !response) {
    return res.status(400).json({
      ok: false,
      error: "device_id, input_id and response are required",
    });
  }

  try {
    // Validate the input_id exists and belongs to this device
    const reqRow = await pool.query(
      `SELECT device_id FROM input_requests WHERE input_id = $1`,
      [input_id]
    );
    if (reqRow.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "input_id not found" });
    }
    if (reqRow.rows[0].device_id !== device_id) {
      return res.status(403).json({
        ok: false,
        error: "input_id does not belong to this device",
      });
    }

    await pool.query(
      `
      INSERT INTO input_responses (input_id, device_id, response, answered_at)
      VALUES ($1, $2, $3, $4::timestamptz)
      ON CONFLICT (input_id) DO UPDATE SET
        response    = EXCLUDED.response,
        answered_at = EXCLUDED.answered_at,
        received_at = NOW()
      `,
      [input_id, device_id, response, answered_at || null]
    );

    console.log(`✅ Input response saved: device=${device_id} input=${input_id}`);
    return res.json({ ok: true, input_id });

  } catch (err) {
    console.error("submitInputResponse error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = { submitInputResponse };


/* ═══════════════════════════════════════════════════════════════════════════
   SQL SCHEMA — run these migrations on your PostgreSQL database
   ═══════════════════════════════════════════════════════════════════════════

-- ── input_requests: tracks free-text input requests sent from admin ──────────
CREATE TABLE IF NOT EXISTS input_requests (
  id          SERIAL PRIMARY KEY,
  input_id    TEXT        NOT NULL UNIQUE,
  device_id   TEXT        NOT NULL,
  message     TEXT        NOT NULL,
  hint        TEXT,
  fcm_msg_id  TEXT,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_input_requests_device ON input_requests (device_id);

-- ── input_responses: stores the user's free-text responses ───────────────────
CREATE TABLE IF NOT EXISTS input_responses (
  id          SERIAL PRIMARY KEY,
  input_id    TEXT        NOT NULL UNIQUE REFERENCES input_requests(input_id),
  device_id   TEXT        NOT NULL,
  response    TEXT        NOT NULL,
  answered_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── device_goals: stores each device's daily goal text ───────────────────────
CREATE TABLE IF NOT EXISTS device_goals (
  device_id  TEXT        NOT NULL PRIMARY KEY,
  goal       TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Already exists (used by question system), shown here for reference:
-- CREATE TABLE IF NOT EXISTS questions (
--   question_id TEXT PRIMARY KEY,
--   device_id   TEXT NOT NULL,
--   message     TEXT NOT NULL,
--   fcm_msg_id  TEXT,
--   sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
-- CREATE TABLE IF NOT EXISTS question_responses (
--   question_id TEXT PRIMARY KEY REFERENCES questions(question_id),
--   device_id   TEXT NOT NULL,
--   answer      TEXT NOT NULL CHECK (answer IN ('yes','no')),
--   answered_at TIMESTAMPTZ,
--   received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
-- CREATE TABLE IF NOT EXISTS device_tokens (
--   device_id     TEXT PRIMARY KEY,
--   fcm_token     TEXT NOT NULL,
--   platform      TEXT NOT NULL DEFAULT 'android',
--   registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );

*/