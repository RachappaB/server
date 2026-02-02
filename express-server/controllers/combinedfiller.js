const pool = require("../db");

async function getCombinedByFilter1(req, res) {
  try {
    const {
      phone_id,
      extension_id,
      laptop_id,
      fitband,
      date,
      bucket
    } = req.query;

    // ---------- DATE HANDLING ----------
    const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : new Date().toISOString().slice(0, 10);

    const targetBucket = bucket !== undefined && bucket !== ""
      ? Number(bucket)
      : null;

    if (targetBucket !== null && (isNaN(targetBucket) || targetBucket < 0 || targetBucket > 95)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid bucket index (0–95 only)"
      });
    }

    const queries = [];
    const params = [];
    let p = 1;

    // ---------- PHONE ----------
    if (phone_id) {
      let q = `
        SELECT 'PHONE' AS source_type,
               ud.device_id,
               ud.usage_date::date AS activity_date,
               ub.bucket_index,
               ub.apps::jsonb AS data,
               ud.received_at
        FROM usage_days ud
        JOIN usage_buckets ub ON ub.day_id = ud.id
        WHERE ud.device_id = $${p++}
          AND ud.usage_date = $${p++}`;
      params.push(phone_id, targetDate);

      if (targetBucket !== null) {
        q += ` AND ub.bucket_index = $${p++}`;
        params.push(targetBucket);
      }

      queries.push(q);
    }

    // ---------- EXTENSION ----------
    if (extension_id) {
      let q = `
        SELECT 'EXTENSION' AS source_type,
               device_id,
               usage_date AS activity_date,
               bucket_index,
               domains::jsonb AS data,
               received_at
        FROM extension_usage_stream
        WHERE device_id = $${p++}
          AND usage_date = $${p++}`;
      params.push(extension_id, targetDate);

      if (targetBucket !== null) {
        q += ` AND bucket_index = $${p++}`;
        params.push(targetBucket);
      }

      queries.push(q);
    }

    // ---------- LAPTOP ----------
    if (laptop_id) {
      let q = `
        SELECT 'LAPTOP' AS source_type,
               la.device_name AS device_id,
               (la.timestamp AT TIME ZONE 'Asia/Kolkata')::date AS activity_date,
               la.bucket_15min_id AS bucket_index,
               la.apps::jsonb AS data,
               la.timestamp AS received_at
        FROM laptop_activity_15m la
        WHERE la.device_name = $${p++}
          AND (la.timestamp AT TIME ZONE 'Asia/Kolkata')::date = $${p++}`;
      params.push(laptop_id, targetDate);

      if (targetBucket !== null) {
        q += ` AND la.bucket_15min_id = $${p++}`;
        params.push(targetBucket);
      }

      queries.push(q);
    }

    // ---------- FITBAND ----------
    if (fitband === "true") {
      let q = `
        SELECT 'FITBAND' AS source_type,
               device_id,
               record_time::date AS activity_date,
               bucket AS bucket_index,
               to_jsonb(motion_data) AS data,
               record_time AS received_at
        FROM fitband_activity_logs
        WHERE record_time::date = $${p++}`;
      params.push(targetDate);

      if (targetBucket !== null) {
        q += ` AND bucket = $${p++}`;
        params.push(targetBucket);
      }

      queries.push(q);
    }

    // ---------- ✅ MORNING THOUGHTS ONLY ----------
    queries.push(`
      SELECT 'MORNING_PLAN' AS source_type,
             'SELF' AS device_id,
             created_at::date AS activity_date,
             -1 AS bucket_index,
             jsonb_build_object(
               'primary_goal', primary_goal,
               'secondary_goal', secondary_goal,
               'expected_energy', expected_energy,
               'distraction_risk', distraction_risk
             ) AS data,
             created_at AS received_at
      FROM morning_plans
      WHERE created_at::date = $${p++}
    `);

    params.push(targetDate);

    // ---------- FINAL QUERY ----------
    if (queries.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "No data sources selected"
      });
    }

    const finalQuery = `
      ${queries.join(" UNION ALL ")}
      ORDER BY bucket_index ASC, received_at ASC
    `;

    const result = await pool.query(finalQuery, params);

    res.json({
      ok: true,
      metadata: {
        requested_date: targetDate,
        requested_bucket: targetBucket,
        count: result.rows.length
      },
      data: result.rows
    });

  } catch (err) {
    console.error("❌ Combined Route Error:", err.stack);

    res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
}

module.exports = {
  getCombinedByFilter1
};
