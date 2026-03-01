const pool = require("../db");

/**
 * ✅ POST /api/phone/usage/day
 * Store ONE day at a time (not batch)
 */


async function uploadUsageDay(req, res) {
  const dayObj = req.body;
  console.log("Received usage day:", {
    device_id: dayObj.device_id,
    date: dayObj.date,
    timezone: dayObj.timezone,
    bucket_minutes: dayObj.bucket_minutes,
    bucket_count: Array.isArray(dayObj.buckets) ? dayObj.buckets.length : 0,
  }); 

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

    // ✅ UPSERT DAY (safe)
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

    let bucketsSaved = 0;

    for (const b of buckets) {

      const bucketIndex = Number(b.bucket);
      const apps = b.apps;

      // ✅ validate bucket index
      if (
        Number.isNaN(bucketIndex) ||
        bucketIndex < 0 ||
        bucketIndex > 95
      ) continue;

      // ✅ SKIP EMPTY BUCKETS (CRITICAL)
      if (!apps || Object.keys(apps).length === 0) continue;

      // ✅ MERGE JSON IN DB
      await client.query(
        `
        INSERT INTO usage_buckets (day_id, bucket_index, apps)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (day_id, bucket_index)
        DO UPDATE SET
          apps = usage_buckets.apps || EXCLUDED.apps,
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
      message: "✅ Usage day stored safely",
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
  console.log("Building full 96 buckets from bucketMap keys:", bucketMap ? Object.keys(bucketMap) : "null");  
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



async function downloadAllForDevice(req, res) {

  const { device_id } = req.params;

  const result = await pool.query(`
    SELECT
      ud.device_id,
      ud.usage_date,
      ud.timezone,
      ud.bucket_minutes,
      ub.bucket_index,
      ub.apps
    FROM usage_days ud
    JOIN usage_buckets ub ON ub.day_id = ud.id
    WHERE ud.device_id = $1
    ORDER BY ud.usage_date DESC, ub.bucket_index ASC
  `, [device_id]);

  res.setHeader("Content-Disposition",
    `attachment; filename=${device_id}_ALL.json`);

  res.json(result.rows);
}



async function downloadLast24(req, res) {

  const { device_id } = req.params;

  const response = await pool.query(`
    SELECT
      ud.device_id,
      ud.usage_date,
      ub.bucket_index,
      ub.apps
    FROM usage_days ud
    JOIN usage_buckets ub ON ub.day_id = ud.id
    WHERE ud.device_id = $1
    ORDER BY ud.usage_date DESC, ub.bucket_index DESC
    LIMIT 192
  `, [device_id]);

  res.setHeader("Content-Disposition",
    `attachment; filename=${device_id}_last24.json`);

  res.json(response.rows);
}



async function getLast24Hours(req, res) {

  const { device_id } = req.params;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const currentBucket =
    Math.floor((now.getHours() * 60 + now.getMinutes()) / 15);

  const result = await pool.query(`
    SELECT
      ud.usage_date,
      ub.bucket_index,
      ub.apps
    FROM usage_days ud
    JOIN usage_buckets ub ON ub.day_id = ud.id
    WHERE ud.device_id = $1
      AND ud.usage_date IN ($2,$3)
    ORDER BY ud.usage_date DESC, ub.bucket_index DESC
  `, [device_id, today, yesterdayStr]);

  const filtered = result.rows.filter(r => {
    if (r.usage_date.toISOString().slice(0,10) === today) {
      return r.bucket_index <= currentBucket;
    }
    return r.bucket_index > currentBucket;
  });

  res.json({
    ok: true,
    device_id,
    window: "last_24_hours",
    bucket_count: filtered.length,
    data: filtered
  });
}

async function getAllDevices(req, res) {

  const result = await pool.query(`
    SELECT DISTINCT device_id
    FROM usage_days
    ORDER BY device_id ASC
  `);

  const devices = result.rows.map(r => r.device_id);

  res.json({
    ok: true,
    count: devices.length,
    devices
  });
}



async function getUsageByDeviceAndDate(req, res) {

  const { device_id, date } = req.params;

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
    WHERE ud.device_id = $1
      AND ud.usage_date = $2::date
    GROUP BY ud.device_id, ud.usage_date, ud.timezone, ud.bucket_minutes
  `,[device_id,date]);

  if(result.rowCount === 0){
    return res.json({
      ok:true,
      message:"No data for this date",
      data:[]
    });
  }

  const row = result.rows[0];

  const fullBuckets = buildFull96Buckets(row.bucket_map);

  res.json({
    ok:true,
    device_id,
    date,
    bucket_minutes: row.bucket_minutes,
    buckets: fullBuckets
  });
}



async function downloadUsageByDate(req,res){

  const { device_id, date } = req.params;

  const result = await pool.query(`
    SELECT
      ud.device_id,
      ud.usage_date,
      ub.bucket_index,
      ub.apps
    FROM usage_days ud
    JOIN usage_buckets ub ON ub.day_id = ud.id
    WHERE ud.device_id = $1
      AND ud.usage_date = $2::date
    ORDER BY ub.bucket_index ASC
  `,[device_id,date]);

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${device_id}_${date}.json`
  );

  res.json(result.rows);
}

module.exports = {
  uploadUsageDay,
  getAllUsage,
  getUsageByDeviceId,
  getAllDevices,
  getLast24Hours,
  downloadLast24,
  downloadAllForDevice,

  getUsageByDeviceAndDate,
  downloadUsageByDate
};
