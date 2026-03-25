const pool = require("../db");

/**
 * POST /api/phonev2/usage/day
 */
async function uploadUsageDay(req, res) {

  const dayObj = req.body;

  console.log("Received V2 usage day:", {
    device_id:      dayObj.device_id,
    date:           dayObj.date,
    timezone:       dayObj.timezone,
    bucket_minutes: dayObj.bucket_minutes,
    bucket_count:   Array.isArray(dayObj.buckets) ? dayObj.buckets.length : 0,
    client_version: dayObj.client_version || 1,
  });

  if (!dayObj || typeof dayObj !== "object") {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const deviceId      = dayObj.device_id;
  const dateStr       = dayObj.date;
  const timezone      = dayObj.timezone || null;
  const bucketMinutes = Number(dayObj.bucket_minutes || 15);
  const clientVersion = Number(dayObj.client_version || 1);
  const buckets       = Array.isArray(dayObj.buckets) ? dayObj.buckets : [];

  if (!deviceId || !dateStr) {
    return res.status(400).json({ ok: false, error: "device_id and date are required" });
  }

  const client = await pool.connect();

  try {

    await client.query("BEGIN");

    const dayResult = await client.query(
      `
      INSERT INTO usage_days_v2
        (device_id, usage_date, timezone, bucket_minutes, client_version)
      VALUES ($1, $2::date, $3, $4, $5)
      ON CONFLICT (device_id, usage_date)
      DO UPDATE SET
        timezone       = EXCLUDED.timezone,
        bucket_minutes = EXCLUDED.bucket_minutes,
        client_version = EXCLUDED.client_version,
        received_at    = NOW()
      RETURNING id
      `,
      [deviceId, dateStr, timezone, bucketMinutes, clientVersion]
    );

    const dayId = dayResult.rows[0].id;

    const values = [];
    const params = [];
    let p = 1;

    for (const b of buckets) {

      const bucketIndex = Number(b.bucket);
      if (Number.isNaN(bucketIndex) || bucketIndex < 0 || bucketIndex > 95) continue;

      const apps           = b.apps            || {};
      const switchPairs    = b.switch_pairs     || {};
      const timeline       = b.timeline         || [];
      const unlocks        = Number(b.unlocks        || 0);
      const notifications  = Number(b.notifications  || 0);
      const notifByApp     = b.notif_by_app     || {};
      const unlockTriggers = b.unlock_triggers  || {};

      if (
        Object.keys(apps).length === 0 &&
        Object.keys(switchPairs).length === 0 &&
        timeline.length === 0 &&
        unlocks === 0 &&
        notifications === 0 &&
        Object.keys(notifByApp).length === 0 &&
        Object.keys(unlockTriggers).length === 0
      ) continue;

      values.push(
        `($${p++}, $${p++}, $${p++}::jsonb, $${p++}::jsonb, $${p++}::jsonb, ` +
        `$${p++}, $${p++}, $${p++}::jsonb, $${p++}::jsonb)`
      );

      params.push(
        dayId,
        bucketIndex,
        JSON.stringify(apps),
        JSON.stringify(switchPairs),
        JSON.stringify(timeline),
        unlocks,
        notifications,
        JSON.stringify(notifByApp),
        JSON.stringify(unlockTriggers)
      );
    }

    let bucketsSaved = 0;

    if (values.length > 0) {
      // FIX: timeline must be REPLACED, not appended with ||.
      // The Android app re-uploads today every 15 minutes with the full timeline
      // for that day. Using || (jsonb array concat) duplicates every entry on
      // every re-upload, making the timeline grow unboundedly.
      //
      // apps, switch_pairs, notif_by_app, unlock_triggers use || (merge) because
      // they are objects keyed by package name — merging is idempotent and correct
      // (newer counts win via EXCLUDED). timeline is an ordered array; replace it.
      //
      // unlocks and notifications are also replaced (EXCLUDED) because the Android
      // payload is always the authoritative count for that bucket window.
      await client.query(`
        INSERT INTO usage_buckets_v2
          (day_id, bucket_index, apps, switch_pairs, timeline,
           unlocks, notifications, notif_by_app, unlock_triggers)
        VALUES ${values.join(",")}
        ON CONFLICT (day_id, bucket_index)
        DO UPDATE SET
          apps            = usage_buckets_v2.apps || EXCLUDED.apps,
          switch_pairs    = usage_buckets_v2.switch_pairs || EXCLUDED.switch_pairs,
          timeline        = EXCLUDED.timeline,
          unlocks         = EXCLUDED.unlocks,
          notifications   = EXCLUDED.notifications,
          notif_by_app    = usage_buckets_v2.notif_by_app || EXCLUDED.notif_by_app,
          unlock_triggers = usage_buckets_v2.unlock_triggers || EXCLUDED.unlock_triggers,
          received_at     = NOW()
      `, params);
      bucketsSaved = values.length;
    }

    await client.query("COMMIT");

    return res.json({ ok: true, device_id: deviceId, date: dateStr, buckets_saved: bucketsSaved });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("uploadUsageDayV2 error:", err);
    return res.status(500).json({ ok: false, error: "Failed to store usage day", details: err.message });
  } finally {
    client.release();
  }
}

/* ================================================================
   SHARED HELPER — used by both report endpoints
   ================================================================ */
async function buildUnlockReport(deviceId, fromDate, toDate) {

  const conditions = ["ud.device_id = $1"];
  const params     = [deviceId];
  let   idx        = 2;

  if (fromDate) {
    conditions.push(`ud.usage_date >= $${idx++}::date`);
    params.push(fromDate);
  }
  if (toDate) {
    conditions.push(`ud.usage_date <= $${idx++}::date`);
    params.push(toDate);
  }

  const where = conditions.join(" AND ");

  const result = await pool.query(
    `
    SELECT
      app_key                              AS app,
      SUM(notif_count::int)                AS total_notifications,
      SUM(trigger_count::int)              AS total_unlock_triggers,
      COUNT(DISTINCT usage_date)           AS days_with_data
    FROM (
      SELECT
        ud.usage_date,
        kv_notif.key                       AS app_key,
        kv_notif.value::text               AS notif_count,
        COALESCE(
          (ub.unlock_triggers ->> kv_notif.key)::int, 0
        )                                  AS trigger_count
      FROM usage_days_v2 ud
      JOIN usage_buckets_v2 ub ON ub.day_id = ud.id
      CROSS JOIN LATERAL jsonb_each_text(ub.notif_by_app) AS kv_notif
      WHERE ${where}
        AND ub.notif_by_app != '{}'::jsonb
    ) sub
    GROUP BY app_key
    ORDER BY total_unlock_triggers DESC, total_notifications DESC
    `,
    params
  );

  return result.rows.map(r => ({
    app:                   r.app,
    total_notifications:   Number(r.total_notifications),
    total_unlock_triggers: Number(r.total_unlock_triggers),
    days_with_data:        Number(r.days_with_data),
    priority_score: r.total_notifications > 0
      ? Math.round((r.total_unlock_triggers / r.total_notifications) * 1000) / 1000
      : 0,
    unlocks_per_day: r.days_with_data > 0
      ? Math.round((r.total_unlock_triggers / r.days_with_data) * 10) / 10
      : 0,
  }));
}

/**
 * GET /api/phonev2/usage/:device_id/unlock-report
 */
async function getUnlockReport(req, res) {

  const { device_id } = req.params;

  let fromDate = null;
  let toDate   = null;
  let label    = "all time";

  if (req.query.days) {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
    const from = new Date();
    from.setDate(from.getDate() - days + 1);
    fromDate = from.toISOString().slice(0, 10);
    toDate   = new Date().toISOString().slice(0, 10);
    label    = `last ${days} days`;
  } else if (req.query.from || req.query.to) {
    fromDate = req.query.from || null;
    toDate   = req.query.to   || null;
    label    = `${fromDate || "start"} to ${toDate || "today"}`;
  }

  try {
    const data = await buildUnlockReport(device_id, fromDate, toDate);
    res.json({ ok: true, device_id, period: label, from: fromDate, to: toDate, app_count: data.length, data });
  } catch (err) {
    console.error("getUnlockReport error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * GET /api/phonev2/usage/:device_id/unlock-report/daily
 */
async function getUnlockReportDaily(req, res) {

  const { device_id } = req.params;

  let fromDate = null;
  let toDate   = null;
  let label    = "all time";

  if (req.query.days) {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
    const from = new Date();
    from.setDate(from.getDate() - days + 1);
    fromDate = from.toISOString().slice(0, 10);
    toDate   = new Date().toISOString().slice(0, 10);
    label    = `last ${days} days`;
  } else if (req.query.from || req.query.to) {
    fromDate = req.query.from || null;
    toDate   = req.query.to   || null;
    label    = `${fromDate || "start"} to ${toDate || "today"}`;
  }

  const conditions = ["ud.device_id = $1"];
  const params     = [device_id];
  let   idx        = 2;

  if (fromDate) { conditions.push(`ud.usage_date >= $${idx++}::date`); params.push(fromDate); }
  if (toDate)   { conditions.push(`ud.usage_date <= $${idx++}::date`); params.push(toDate);   }

  const where = conditions.join(" AND ");

  try {
    const result = await pool.query(
      `
      SELECT
        ud.usage_date,
        kv_notif.key                       AS app,
        SUM(kv_notif.value::text::int)     AS notifications,
        SUM(
          COALESCE((ub.unlock_triggers ->> kv_notif.key)::int, 0)
        )                                  AS unlock_triggers
      FROM usage_days_v2 ud
      JOIN usage_buckets_v2 ub ON ub.day_id = ud.id
      CROSS JOIN LATERAL jsonb_each_text(ub.notif_by_app) AS kv_notif
      WHERE ${where}
        AND ub.notif_by_app != '{}'::jsonb
      GROUP BY ud.usage_date, kv_notif.key
      ORDER BY ud.usage_date DESC, unlock_triggers DESC, notifications DESC
      `,
      params
    );

    const byDate = {};
    for (const r of result.rows) {
      const d = r.usage_date.toISOString
        ? r.usage_date.toISOString().slice(0, 10)
        : String(r.usage_date).slice(0, 10);

      if (!byDate[d]) byDate[d] = [];
      byDate[d].push({
        app:             r.app,
        notifications:   Number(r.notifications),
        unlock_triggers: Number(r.unlock_triggers),
        priority_score:  r.notifications > 0
          ? Math.round((r.unlock_triggers / r.notifications) * 1000) / 1000
          : 0,
      });
    }

    res.json({ ok: true, device_id, period: label, from: fromDate, to: toDate, days: Object.keys(byDate).length, data: byDate });

  } catch (err) {
    console.error("getUnlockReportDaily error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * Convert bucket_map -> full 96 buckets
 */
function buildFull96Buckets(bucketMap) {
  const buckets = [];
  for (let i = 0; i < 96; i++) {
    const data = (bucketMap && bucketMap[i.toString()]) || {};
    buckets.push({
      bucket:          i,
      apps:            data.apps            || {},
      switch_pairs:    data.switch_pairs    || {},
      timeline:        data.timeline        || [],
      unlocks:         data.unlocks         || 0,
      notifications:   data.notifications   || 0,
      notif_by_app:    data.notif_by_app    || {},
      unlock_triggers: data.unlock_triggers || {},
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
    SELECT ud.device_id, ud.usage_date, ud.timezone, ud.bucket_minutes,
      COALESCE(json_object_agg(ub.bucket_index::text,
        json_build_object('apps', ub.apps, 'switch_pairs', ub.switch_pairs,
          'timeline', ub.timeline, 'unlocks', ub.unlocks,
          'notifications', ub.notifications, 'notif_by_app', ub.notif_by_app,
          'unlock_triggers', ub.unlock_triggers)
      ) FILTER (WHERE ub.id IS NOT NULL), '{}'::json) AS bucket_map
    FROM usage_days_v2 ud
    LEFT JOIN usage_buckets_v2 ub ON ub.day_id = ud.id
    WHERE ud.device_id = $1
    GROUP BY ud.device_id, ud.usage_date, ud.timezone, ud.bucket_minutes
    ORDER BY ud.usage_date DESC
    `, [device_id]
  );
  const fixed = result.rows.map(row => ({
    device_id: row.device_id, usage_date: row.usage_date,
    timezone: row.timezone, bucket_minutes: row.bucket_minutes,
    buckets: buildFull96Buckets(row.bucket_map),
  }));
  res.json({ ok: true, device_id, count: fixed.length, data: fixed });
}

/**
 * GET /api/phonev2/usage/all
 */
async function getAllUsage(req, res) {
  const result = await pool.query(`
    SELECT ud.device_id, ud.usage_date, ud.timezone, ud.bucket_minutes,
      COALESCE(json_object_agg(ub.bucket_index::text,
        json_build_object('apps', ub.apps, 'switch_pairs', ub.switch_pairs,
          'timeline', ub.timeline, 'unlocks', ub.unlocks,
          'notifications', ub.notifications, 'notif_by_app', ub.notif_by_app,
          'unlock_triggers', ub.unlock_triggers)
      ) FILTER (WHERE ub.id IS NOT NULL), '{}'::json) AS bucket_map
    FROM usage_days_v2 ud
    LEFT JOIN usage_buckets_v2 ub ON ub.day_id = ud.id
    GROUP BY ud.device_id, ud.usage_date, ud.timezone, ud.bucket_minutes
    ORDER BY ud.usage_date DESC, ud.device_id ASC
  `);
  const fixed = result.rows.map(row => ({
    device_id: row.device_id, usage_date: row.usage_date,
    timezone: row.timezone, bucket_minutes: row.bucket_minutes,
    buckets: buildFull96Buckets(row.bucket_map),
  }));
  res.json({ ok: true, count: fixed.length, data: fixed });
}

async function downloadAllForDevice(req, res) {
  const { device_id } = req.params;
  const result = await pool.query(
    `SELECT ud.device_id, ud.usage_date, ub.bucket_index, ub.apps, ub.switch_pairs,
            ub.timeline, ub.unlocks, ub.notifications, ub.notif_by_app, ub.unlock_triggers
     FROM usage_days_v2 ud JOIN usage_buckets_v2 ub ON ub.day_id = ud.id
     WHERE ud.device_id = $1 ORDER BY ud.usage_date DESC, ub.bucket_index ASC`,
    [device_id]
  );
  res.setHeader("Content-Disposition", `attachment; filename=${device_id}_ALL_V2.json`);
  res.json(result.rows);
}

async function downloadLast24(req, res) {
  const { device_id } = req.params;
  const result = await pool.query(
    `SELECT ud.device_id, ud.usage_date, ub.bucket_index, ub.apps, ub.switch_pairs,
            ub.timeline, ub.unlocks, ub.notifications, ub.notif_by_app, ub.unlock_triggers
     FROM usage_days_v2 ud JOIN usage_buckets_v2 ub ON ub.day_id = ud.id
     WHERE ud.device_id = $1 ORDER BY ud.usage_date DESC, ub.bucket_index DESC LIMIT 192`,
    [device_id]
  );
  res.setHeader("Content-Disposition", `attachment; filename=${device_id}_last24_V2.json`);
  res.json(result.rows);
}

async function getAllDevices(req, res) {
  const result = await pool.query(
    `SELECT DISTINCT device_id FROM usage_days_v2 ORDER BY device_id ASC`
  );
  res.json({ ok: true, count: result.rows.length, devices: result.rows.map(r => r.device_id) });
}

async function getUsageByDeviceAndDate(req, res) {
  const { device_id, date } = req.params;
  const result = await pool.query(
    `SELECT ud.device_id, ud.usage_date, ud.timezone, ud.bucket_minutes,
      COALESCE(json_object_agg(ub.bucket_index::text,
        json_build_object('apps', ub.apps, 'switch_pairs', ub.switch_pairs,
          'timeline', ub.timeline, 'unlocks', ub.unlocks,
          'notifications', ub.notifications, 'notif_by_app', ub.notif_by_app,
          'unlock_triggers', ub.unlock_triggers)
      ) FILTER (WHERE ub.id IS NOT NULL), '{}'::json) AS bucket_map
     FROM usage_days_v2 ud LEFT JOIN usage_buckets_v2 ub ON ub.day_id = ud.id
     WHERE ud.device_id = $1 AND ud.usage_date = $2::date
     GROUP BY ud.device_id, ud.usage_date, ud.timezone, ud.bucket_minutes`,
    [device_id, date]
  );
  if (result.rowCount === 0) return res.json({ ok: true, message: "No data for this date", data: [] });
  const row = result.rows[0];
  res.json({ ok: true, device_id, date, bucket_minutes: row.bucket_minutes, buckets: buildFull96Buckets(row.bucket_map) });
}

async function downloadUsageByDate(req, res) {
  const { device_id, date } = req.params;
  const result = await pool.query(
    `SELECT ud.device_id, ud.usage_date, ub.bucket_index, ub.apps, ub.switch_pairs,
            ub.timeline, ub.unlocks, ub.notifications, ub.notif_by_app, ub.unlock_triggers
     FROM usage_days_v2 ud JOIN usage_buckets_v2 ub ON ub.day_id = ud.id
     WHERE ud.device_id = $1 AND ud.usage_date = $2::date ORDER BY ub.bucket_index ASC`,
    [device_id, date]
  );
  res.setHeader("Content-Disposition", `attachment; filename=${device_id}_${date}_V2.json`);
  res.json(result.rows);
}

/**
 * GET /api/phonev2/usage/last24/:device_id   (legacy route — kept for compatibility)
 *
 * FIX: this function was referenced in the router but missing from the controller,
 * causing a crash ("phoneController.getLast24Hours is not a function") on every
 * request to that route. Implemented as an alias of downloadLast24 but returns
 * JSON without a Content-Disposition header so the browser renders it inline.
 */
async function getLast24Hours(req, res) {
  const { device_id } = req.params;
  const result = await pool.query(
    `SELECT ud.device_id, ud.usage_date, ub.bucket_index, ub.apps, ub.switch_pairs,
            ub.timeline, ub.unlocks, ub.notifications, ub.notif_by_app, ub.unlock_triggers
     FROM usage_days_v2 ud JOIN usage_buckets_v2 ub ON ub.day_id = ud.id
     WHERE ud.device_id = $1 ORDER BY ud.usage_date DESC, ub.bucket_index DESC LIMIT 192`,
    [device_id]
  );
  res.json({ ok: true, device_id, count: result.rows.length, data: result.rows });
}

module.exports = {
  uploadUsageDay,
  getAllUsage,
  getUsageByDeviceId,
  getAllDevices,
  downloadLast24,
  downloadAllForDevice,
  getUsageByDeviceAndDate,
  downloadUsageByDate,
  getUnlockReport,
  getUnlockReportDaily,
  getLast24Hours,   // FIX: was exported as missing, causing runtime crash on /usage/last24/:device_id
};