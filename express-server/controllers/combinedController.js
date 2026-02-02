const pool = require("../db");

// ==========================================
// GET COMBINED DATA WITH DATE + BUCKET FILTER
// ==========================================

async function getCombinedByFilter(req, res) {

  try {

    const {
      phone_id,
      extension_id,
      laptop_id,
      fitband,
      date,
      bucket
    } = req.query;

    // ================= DEFAULT DATE =================

    const targetDate =
      date || new Date().toISOString().slice(0, 10);

    // ================= BUCKET VALIDATION =================

    const targetBucket =
      bucket !== undefined ? Number(bucket) : null;

    if (targetBucket !== null) {

      if (isNaN(targetBucket) || targetBucket < 0 || targetBucket > 95) {

        return res.status(400).json({
          ok: false,
          error: "Invalid bucket (0-95)"
        });

      }
    }

    const queries = [];
    const params = [];
    let p = 1;

    // ====================================================
    // PHONE
    // ====================================================

    if (phone_id) {

      let phoneQuery = `
        SELECT
          'PHONE' AS source_type,
          ud.device_id,
          ud.usage_date::date AS activity_date,
          ub.bucket_index,
          ub.apps::jsonb AS data,
          ud.received_at

        FROM usage_days ud
        JOIN usage_buckets ub
          ON ub.day_id = ud.id

        WHERE ud.device_id = $${p++}
          AND ud.usage_date = $${p++}
      `;

      params.push(phone_id, targetDate);

      if (targetBucket !== null) {
        phoneQuery += ` AND ub.bucket_index = $${p++}`;
        params.push(targetBucket);
      }

      queries.push(phoneQuery);
    }

    // ====================================================
    // EXTENSION
    // ====================================================

    if (extension_id) {

      let extQuery = `
        SELECT
          'EXTENSION' AS source_type,
          eus.device_id,
          eus.usage_date,
          eus.bucket_index,
          eus.domains::jsonb AS data,
          eus.received_at

        FROM extension_usage_stream eus

        WHERE eus.device_id = $${p++}
          AND eus.usage_date = $${p++}
      `;

      params.push(extension_id, targetDate);

      if (targetBucket !== null) {
        extQuery += ` AND eus.bucket_index = $${p++}`;
        params.push(targetBucket);
      }

      queries.push(extQuery);
    }

    // ====================================================
    // LAPTOP
    // ====================================================

    if (laptop_id) {

      let laptopQuery = `
        SELECT
          'LAPTOP' AS source_type,

          la.device_name AS device_id,

          DATE(la.timestamp AT TIME ZONE 'Asia/Kolkata') AS activity_date,

          la.bucket_15min_id AS bucket_index,

          la.apps::jsonb AS data,

          la.timestamp AS received_at

        FROM laptop_activity_15m la

        WHERE la.device_name = $${p++}
          AND DATE(la.timestamp AT TIME ZONE 'Asia/Kolkata') = $${p++}::date
      `;

      params.push(laptop_id, targetDate);

      if (targetBucket !== null) {
        laptopQuery += ` AND la.bucket_15min_id = $${p++}`;
        params.push(targetBucket);
      }

      queries.push(laptopQuery);
    }

    // ====================================================
    // FITBAND
    // ====================================================

    if (fitband === "true") {

      let fitbandQuery = `
        SELECT
          'FITBAND' AS source_type,

          device_id,

          record_time::date AS activity_date,

          bucket AS bucket_index,

          to_jsonb(motion_data) AS data,

          record_time AS received_at

        FROM fitband_activity_logs

        WHERE record_time::date = $${p++}
      `;

      params.push(targetDate);

      if (targetBucket !== null) {
        fitbandQuery += ` AND bucket = $${p++}`;
        params.push(targetBucket);
      }

      queries.push(fitbandQuery);
    }

    // ====================================================
    // ✅ MORNING PLAN (DAILY DEFAULT)
    // ====================================================

    const morningQuery = `
      SELECT
        'MORNING_PLAN' AS source_type,
        'SELF' AS device_id,
        created_at::date AS activity_date,
        -1 AS bucket_index,
        to_jsonb(mp) AS data,
        created_at AS received_at

      FROM morning_plans mp
      WHERE created_at::date = $${p++}
    `;

    params.push(targetDate);
    queries.push(morningQuery);

    // ====================================================
    // ✅ NIGHT REVIEW (DAILY DEFAULT)
    // ====================================================

    const nightQuery = `
      SELECT
        'NIGHT_REVIEW' AS source_type,
        'SELF' AS device_id,
        created_at::date AS activity_date,
        -1 AS bucket_index,
        to_jsonb(nr) AS data,
        created_at AS received_at

      FROM night_reviews nr
      WHERE created_at::date = $${p++}
    `;

    params.push(targetDate);
    queries.push(nightQuery);

    // ====================================================
    // ✅ EMOTION LOGS (MULTIPLE PER DAY)
    // ====================================================

    const emotionQuery = `
      SELECT
        'EMOTION' AS source_type,
        'SELF' AS device_id,
        created_at::date AS activity_date,
        -1 AS bucket_index,
        to_jsonb(el) AS data,
        created_at AS received_at

      FROM emotional_logs el
      WHERE created_at::date = $${p++}
    `;

    params.push(targetDate);
    queries.push(emotionQuery);

    // ====================================================
    // FINAL QUERY
    // ====================================================

    const finalQuery = `
      ${queries.join(" UNION ALL ")}
      ORDER BY bucket_index ASC, received_at ASC
    `;

    const result = await pool.query(finalQuery, params);

    // ====================================================
    // RESPONSE
    // ====================================================

    res.json({
      ok: true,
      date: targetDate,
      bucket: targetBucket,
      total_records: result.rows.length,
      data: result.rows
    });

  } catch (err) {

    console.error("❌ Combined Query Error:", err);

    res.status(500).json({
      ok: false,
      error: "Failed to fetch combined data"
    });

  }
}

module.exports = {
  getCombinedByFilter
};
