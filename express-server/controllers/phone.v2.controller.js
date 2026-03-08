const pool = require("../db");

/**
 * POST /api/phonev2/usage/day
 */

async function uploadUsageDay(req, res) {

  const dayObj = req.body;

  console.log("Received V2 usage day:", {
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

    const dayResult = await client.query(
      `
      INSERT INTO usage_days_v2 (device_id, usage_date, timezone, bucket_minutes)
      VALUES ($1,$2::date,$3,$4)
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

      if (Number.isNaN(bucketIndex) || bucketIndex < 0 || bucketIndex > 95)
        continue;

      const apps = b.apps || {};
      const switchPairs = b.switch_pairs || {};
      const timeline = b.timeline || [];

      if (
        Object.keys(apps).length === 0 &&
        Object.keys(switchPairs).length === 0 &&
        timeline.length === 0
      ) continue;

      await client.query(
        `
        INSERT INTO usage_buckets_v2
        (day_id, bucket_index, apps, switch_pairs, timeline)
        VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb)
        ON CONFLICT (day_id, bucket_index)
        DO UPDATE SET
          apps = usage_buckets_v2.apps || EXCLUDED.apps,
          switch_pairs = usage_buckets_v2.switch_pairs || EXCLUDED.switch_pairs,
          timeline = usage_buckets_v2.timeline || EXCLUDED.timeline,
          received_at = NOW()
        `,
        [
          dayId,
          bucketIndex,
          JSON.stringify(apps),
          JSON.stringify(switchPairs),
          JSON.stringify(timeline)
        ]
      );

      bucketsSaved++;

    }

    await client.query("COMMIT");

    return res.json({
      ok: true,
      device_id: deviceId,
      date: dateStr,
      buckets_saved: bucketsSaved
    });

  } catch (err) {

    await client.query("ROLLBACK");

    console.error("uploadUsageDayV2 error:", err);

    return res.status(500).json({
      ok: false,
      error: "Failed to store usage day",
      details: err.message
    });

  } finally {

    client.release();

  }

}



/**
 * Convert bucket_map -> 96 buckets
 */

function buildFull96Buckets(bucketMap) {

  const buckets = [];

  for (let i = 0; i < 96; i++) {

    const data = bucketMap && bucketMap[i.toString()]
      ? bucketMap[i.toString()]
      : { apps: {}, switch_pairs: {}, timeline: [] };

    buckets.push({
      bucket: i,
      apps: data.apps || {},
      switch_pairs: data.switch_pairs || {},
      timeline: data.timeline || []
    });

  }

  return buckets;

}



/**
 * GET /api/phonev2/usage/:device_id
 */

async function getUsageByDeviceId(req, res) {

  const { device_id } = req.params;

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
          json_build_object(
            'apps', ub.apps,
            'switch_pairs', ub.switch_pairs,
            'timeline', ub.timeline
          )
        ) FILTER (WHERE ub.id IS NOT NULL),
        '{}'::json
      ) AS bucket_map

    FROM usage_days_v2 ud
    LEFT JOIN usage_buckets_v2 ub
      ON ub.day_id = ud.id

    WHERE ud.device_id = $1

    GROUP BY
      ud.device_id,
      ud.usage_date,
      ud.timezone,
      ud.bucket_minutes

    ORDER BY ud.usage_date DESC
    `,
    [device_id]
  );

  const fixed = result.rows.map(row => ({
    device_id: row.device_id,
    usage_date: row.usage_date,
    timezone: row.timezone,
    bucket_minutes: row.bucket_minutes,
    buckets: buildFull96Buckets(row.bucket_map)
  }));

  res.json({
    ok: true,
    device_id,
    count: fixed.length,
    data: fixed
  });

}



/**
 * GET /api/phonev2/usage/all
 */

async function getAllUsage(req, res) {

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
          json_build_object(
            'apps', ub.apps,
            'switch_pairs', ub.switch_pairs,
            'timeline', ub.timeline
          )
        ) FILTER (WHERE ub.id IS NOT NULL),
        '{}'::json
      ) AS bucket_map

    FROM usage_days_v2 ud
    LEFT JOIN usage_buckets_v2 ub
      ON ub.day_id = ud.id

    GROUP BY
      ud.device_id,
      ud.usage_date,
      ud.timezone,
      ud.bucket_minutes

    ORDER BY ud.usage_date DESC, ud.device_id ASC
    `
  );

  const fixed = result.rows.map(row => ({
    device_id: row.device_id,
    usage_date: row.usage_date,
    timezone: row.timezone,
    bucket_minutes: row.bucket_minutes,
    buckets: buildFull96Buckets(row.bucket_map)
  }));

  res.json({
    ok: true,
    count: fixed.length,
    data: fixed
  });

}



/**
 * Download ALL usage for device
 */

async function downloadAllForDevice(req, res) {

  const { device_id } = req.params;

  const result = await pool.query(
    `
    SELECT
      ud.device_id,
      ud.usage_date,
      ub.bucket_index,
      ub.apps,
      ub.switch_pairs,
      ub.timeline

    FROM usage_days_v2 ud
    JOIN usage_buckets_v2 ub
      ON ub.day_id = ud.id

    WHERE ud.device_id = $1

    ORDER BY ud.usage_date DESC, ub.bucket_index ASC
    `,
    [device_id]
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${device_id}_ALL_V2.json`
  );

  res.json(result.rows);

}



/**
 * Download last 24h
 */

async function downloadLast24(req, res) {

  const { device_id } = req.params;

  const result = await pool.query(
    `
    SELECT
      ud.device_id,
      ud.usage_date,
      ub.bucket_index,
      ub.apps,
      ub.switch_pairs,
      ub.timeline

    FROM usage_days_v2 ud
    JOIN usage_buckets_v2 ub
      ON ub.day_id = ud.id

    WHERE ud.device_id = $1

    ORDER BY ud.usage_date DESC, ub.bucket_index DESC
    LIMIT 192
    `,
    [device_id]
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${device_id}_last24_V2.json`
  );

  res.json(result.rows);

}



/**
 * List all devices
 */

async function getAllDevices(req, res) {

  const result = await pool.query(`
    SELECT DISTINCT device_id
    FROM usage_days_v2
    ORDER BY device_id ASC
  `);

  const devices = result.rows.map(r => r.device_id);

  res.json({
    ok: true,
    count: devices.length,
    devices
  });

}



/**
 * Get usage for specific date
 */

async function getUsageByDeviceAndDate(req, res) {

  const { device_id, date } = req.params;

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
          json_build_object(
            'apps', ub.apps,
            'switch_pairs', ub.switch_pairs,
            'timeline', ub.timeline
          )
        ) FILTER (WHERE ub.id IS NOT NULL),
        '{}'::json
      ) AS bucket_map

    FROM usage_days_v2 ud
    LEFT JOIN usage_buckets_v2 ub
      ON ub.day_id = ud.id

    WHERE ud.device_id = $1
      AND ud.usage_date = $2::date

    GROUP BY
      ud.device_id,
      ud.usage_date,
      ud.timezone,
      ud.bucket_minutes
    `,
    [device_id, date]
  );

  if (result.rowCount === 0) {
    return res.json({
      ok: true,
      message: "No data for this date",
      data: []
    });
  }

  const row = result.rows[0];

  const fullBuckets = buildFull96Buckets(row.bucket_map);

  res.json({
    ok: true,
    device_id,
    date,
    bucket_minutes: row.bucket_minutes,
    buckets: fullBuckets
  });

}



/**
 * Download usage by date
 */

async function downloadUsageByDate(req, res) {

  const { device_id, date } = req.params;

  const result = await pool.query(
    `
    SELECT
      ud.device_id,
      ud.usage_date,
      ub.bucket_index,
      ub.apps,
      ub.switch_pairs,
      ub.timeline

    FROM usage_days_v2 ud
    JOIN usage_buckets_v2 ub
      ON ub.day_id = ud.id

    WHERE ud.device_id = $1
      AND ud.usage_date = $2::date

    ORDER BY ub.bucket_index ASC
    `,
    [device_id, date]
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${device_id}_${date}_V2.json`
  );

  res.json(result.rows);

}



module.exports = {

  uploadUsageDay,
  getAllUsage,
  getUsageByDeviceId,
  getAllDevices,
  downloadLast24,
  downloadAllForDevice,
  getUsageByDeviceAndDate,
  downloadUsageByDate

};