const pool = require("../db");

/**
 * ✅ POST /api/phone/usage/day
 * Store ONE day at a time (not batch)
 */
async function uploadUsageDay(req, res) {
  const dayObj = req.body;

  if (!dayObj || typeof dayObj !== "object") {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const deviceId = dayObj.device_id;
  const dateStr = dayObj.date;
  const timezone = dayObj.timezone || null;
  const bucketMinutes = Number(dayObj.bucket_minutes || 15);
  const buckets = Array.isArray(dayObj.buckets) ? dayObj.buckets : [];

  if (!deviceId || !dateStr) {
    return res.status(400).json({
      ok: false,
      error: "device_id and date are required",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ✅ upsert day row
    const dayResult = await client.query(
      `
      INSERT INTO usage_days (device_id, usage_date, timezone, bucket_minutes)
      VALUES ($1, $2::date, $3, $4)
      ON CONFLICT (device_id, usage_date)
      DO UPDATE SET
        timezone = EXCLUDED.timezone,
        bucket_minutes = EXCLUDED.bucket_minutes,
        received_at = NOW()
      RETURNING id
      `,
      [deviceId, dateStr, timezone, bucketMinutes]
    );

    const dayId = dayResult.rows[0].id;

    // ✅ save ALL buckets (even empty {} if you want)
    let bucketsSaved = 0;

    for (const b of buckets) {
      const bucketIndex = Number(b.bucket);
      const apps = b.apps || {};

      if (Number.isNaN(bucketIndex) || bucketIndex < 0 || bucketIndex > 95) continue;

      await client.query(
        `
        INSERT INTO usage_buckets (day_id, bucket_index, apps)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (day_id, bucket_index)
        DO UPDATE SET
          apps = EXCLUDED.apps,
          received_at = NOW()
        `,
        [dayId, bucketIndex, JSON.stringify(apps)]
      );

      bucketsSaved++;
    }

    await client.query("COMMIT");

    console.log(
      `✅ Stored usage day: device=${deviceId} date=${dateStr} buckets=${bucketsSaved}`
    );

    return res.status(200).json({
      ok: true,
      message: "✅ One day usage stored successfully",
      device_id: deviceId,
      date: dateStr,
      buckets_saved: bucketsSaved,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ uploadUsageDay error:", err.message);

    return res.status(500).json({
      ok: false,
      error: "Failed to store usage day",
      details: err.message,
    });
  } finally {
    client.release();
  }
}

/**
 * ✅ Helper: Convert bucket_map -> full 96 bucket list
 */
function buildFull96Buckets(bucketMap) {
  const buckets = [];
  for (let i = 0; i < 96; i++) {
    const apps = (bucketMap && bucketMap[i.toString()]) ? bucketMap[i.toString()] : {};
    buckets.push({ bucket: i, apps });
  }
  return buckets;
}

/**
 * ✅ GET /api/phone/usage/:device_id
 * Returns ALL 96 buckets always (0..95) for each day
 */
async function getUsageByDeviceId(req, res) {
  const { device_id } = req.params;
  console.log("Fetching usage for device_id:", device_id);

  const result = await pool.query(
    `
    SELECT
      ud.device_id,
      ud.usage_date,
      ud.timezone,
      ud.bucket_minutes,

      COALESCE(
        json_object_agg(
          ub.bucket_index::text,
          ub.apps
        ) FILTER (WHERE ub.id IS NOT NULL),
        '{}'::json
      ) AS bucket_map

    FROM usage_days ud
    LEFT JOIN usage_buckets ub ON ub.day_id = ud.id
    WHERE ud.device_id = $1
    GROUP BY ud.device_id, ud.usage_date, ud.timezone, ud.bucket_minutes
    ORDER BY ud.usage_date DESC;
    `,
    [device_id]
  );

  const fixed = result.rows.map((row) => {
    return {
      device_id: row.device_id,
      usage_date: row.usage_date,
      timezone: row.timezone,
      bucket_minutes: row.bucket_minutes,
      buckets: buildFull96Buckets(row.bucket_map),
    };
  });

  return res.json({
    ok: true,
    device_id,
    count: fixed.length,
    data: fixed,
  });
}

/**
 * ✅ GET /api/phone/usage/all
 * Returns ALL 96 buckets always (0..95) for all devices and all days
 */
async function getAllUsage(req, res) {
  console.log("Fetching all usage data for all devices");

  const result = await pool.query(`
    SELECT
      ud.device_id,
      ud.usage_date,
      ud.timezone,
      ud.bucket_minutes,

      COALESCE(
        json_object_agg(
          ub.bucket_index::text,
          ub.apps
        ) FILTER (WHERE ub.id IS NOT NULL),
        '{}'::json
      ) AS bucket_map

    FROM usage_days ud
    LEFT JOIN usage_buckets ub ON ub.day_id = ud.id
    GROUP BY ud.device_id, ud.usage_date, ud.timezone, ud.bucket_minutes
    ORDER BY ud.usage_date DESC, ud.device_id ASC;
  `);

  const fixed = result.rows.map((row) => {
    return {
      device_id: row.device_id,
      usage_date: row.usage_date,
      timezone: row.timezone,
      bucket_minutes: row.bucket_minutes,
      buckets: buildFull96Buckets(row.bucket_map),
    };
  });

  return res.json({
    ok: true,
    count: fixed.length,
    data: fixed,
  });
}

module.exports = {
  uploadUsageDay,
  getAllUsage,
  getUsageByDeviceId,
};
