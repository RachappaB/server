const pool = require("../db");

// ================= SYSTEM CONSTANTS =================

const EXPECTED_BUCKET_SAMPLES = 45;
const IST_OFFSET_MS = 19800 * 1000;

// ================= HELPERS =================

// Normalize bucket size only for storage safety
function normalizeMotionArray(data) {

  let arr = [...data];

  if (arr.length === 0) arr = [1];

  if (arr.length < EXPECTED_BUCKET_SAMPLES) {

    const last = arr[arr.length - 1];

    while (arr.length < EXPECTED_BUCKET_SAMPLES) {
      arr.push(last);
    }
  }

  if (arr.length > EXPECTED_BUCKET_SAMPLES) {
    arr = arr.slice(0, EXPECTED_BUCKET_SAMPLES);
  }

  return arr;
}

// ======================================================
// ESP32 RAW INGEST API (STORE FIRST — NO ANALYSIS)
// ======================================================







async function saveMotionData(req, res) {

  const client = await pool.connect();
  console.log("Received ESP32 data upload request");
  console.log("Request body:", req.body); 

  try {

    const { bucket, motion } = req.body;

    console.log("ESP32 Upload:", bucket);

    // ========== VALIDATION ==========

    if (!Number.isInteger(bucket)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid bucket"
      });
    }

    if (!Array.isArray(motion) || motion.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "Invalid motion array"
      });
    }

    for (const v of motion) {
      if (!Number.isInteger(v) || v < 0 || v > 4) {
        return res.status(400).json({
          ok: false,
          error: "Invalid motion value"
        });
      }
    }

    await client.query("BEGIN");

    // ========== DUPLICATE CHECK (IST SAFE) ==========

    const exists = await client.query(
      `
      SELECT id
      FROM fitband_activity_logs
      WHERE bucket = $1
      AND created_at::date = NOW()::date
      `,
      [bucket]
    );

    if (exists.rows.length) {

      await client.query("ROLLBACK");

      console.log("Duplicate bucket skipped:", bucket);

      // 304 = Not Modified (clean semantic for duplicate)
      return res.status(304).json({
        ok: false,
        skipped: true,
        message: "Bucket already exists today"
      });
    }

    // ========== NORMALIZE AND STORE ==========

    const normalized = normalizeMotionArray(motion);

    await client.query(
      `INSERT INTO fitband_activity_logs
        (bucket, motion_data, raw_motion_data)
         VALUES ($1, $2, $3::jsonb) `,
      [
        bucket,
        normalized,                // stays array
        JSON.stringify(motion)     // stringify for jsonb
     ]
      
    );


    await client.query("COMMIT");

    console.log("Raw bucket stored:", bucket);

    // 200 = Real success
    return res.status(200).json({
      ok: true,
      bucket,
      stored_samples: normalized.length
    });

  } catch (err) {

    await client.query("ROLLBACK");

    console.error("RAW Insert Error:", err);

    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });

  } finally {

    client.release();
  }
}










// ======================================================
// DASHBOARD APIs (READ-ONLY)
// ======================================================

// ===== BUCKET ANALYTICS FOR DAY =====

async function getBucketByDay(req, res) {

  try {

    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: "Date required (YYYY-MM-DD)" });
    }

    const result = await pool.query(
      `
      SELECT
        bucket,
        active_minutes,
        sedentary_minutes,
        dominant_activity,
        suggested_task,
        health_state,
        posture_changes,
        posture_stability,
        health_insights,
        time_sleep,
        time_sit,
        time_stand,
        time_walk,
        time_run,
        standing_minutes,
        created_at
      FROM fitband_bucket_insights
      WHERE created_at::date = $1
      ORDER BY bucket ASC
      `,
      [date]
    );

    res.json(result.rows);

  } catch (err) {

    console.error("Bucket fetch error:", err);
    res.status(500).json([]);
  }
}

// ===== TASK HISTORY =====

async function getTaskHistory(req, res) {

  try {

    const result = await pool.query(
      `
      SELECT *
      FROM fitband_task_log
      ORDER BY delivered_at DESC
      LIMIT 30
      `
    );

    res.json(result.rows);

  } catch (err) {

    console.error("Task fetch error:", err);
    res.status(500).json([]);
  }
}

// ===== DAILY SUMMARY =====

async function getDailySummary(req, res) {

  try {

    const result = await pool.query(
      `
      SELECT *
      FROM fitband_daily_summary
      ORDER BY day DESC
      LIMIT 30
      `
    );

    res.json(result.rows);

  } catch (err) {

    console.error("Daily summary error:", err);
    res.status(500).json([]);
  }
}

// ===== MOTION LOGS =====

async function getMotionData(req, res) {

  try {

    const { date } = req.query;

    let query;
    let params = [];

    if (date) {
      query = `
      SELECT id, bucket, motion_data, created_at
      FROM fitband_activity_logs
      WHERE created_at::date = $1::date
      ORDER BY bucket ASC
      LIMIT 200
      `;
      params = [date];
      console.log(`[Motion] Fetching for IST date: ${date}`);
    } else {
      query = `
      SELECT id, bucket, motion_data, created_at
      FROM fitband_activity_logs
      ORDER BY created_at DESC
      LIMIT 200
      `;
    }

    const result = await pool.query(query, params);

    if (date) {
      console.log(`[Motion] Returned ${result.rows.length} rows for ${date}`);
      if (result.rows.length > 0) {
        console.log(`[Motion] First: ${result.rows[0].bucket} at ${result.rows[0].created_at}`);
        console.log(`[Motion] Last: ${result.rows[result.rows.length-1].bucket} at ${result.rows[result.rows.length-1].created_at}`);
      }
    }

    res.json(result.rows);

  } catch (err) {

    console.error("Motion fetch error:", err);
    res.status(500).json([]);
  }

}

// ======================================================
// EXPORT
// ======================================================

module.exports = {

  // ESP32
  saveMotionData,

  // Dashboard
  getBucketByDay,
  getTaskHistory,
  getDailySummary,
  getMotionData
};
