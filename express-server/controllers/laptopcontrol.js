const pool = require("../db");

// --------------------------------------
// POST LAPTOP DATA (AGENT PUSH)
// --------------------------------------

async function receiveLaptopData(req, res) {

  try {

    const data = req.body;

    const query = `
      INSERT INTO laptop_activity_15m (

        timestamp,
        bucket_15min_id,

        device_name,
        username,
        os,
        time_bucket,

        keys_count,
        mouse_count,

        active_seconds,
        idle_seconds,
        locked_seconds,

        app_switch_count,
        max_focus_streak_seconds,

        background_media,
        background_media_seconds,
        background_media_source,
        background_media_title,

        apps

      ) VALUES (

        $1,$2,
        $3,$4,$5,$6,
        $7,$8,
        $9,$10,$11,
        $12,$13,
        $14,$15,$16,$17,
        $18

      )
    `;

    const values = [

      data.timestamp,
      data.bucket_15min_id,

      data.device,
      data.user,
      data.os,
      data.time_bucket,

      data.keys_count,
      data.mouse_count,

      data.active_seconds,
      data.idle_seconds,
      data.locked_seconds,

      data.app_switch_count,
      data.max_focus_streak_seconds,

      data.background_media,
      data.background_media_seconds,
      data.background_media_source,
      data.background_media_title,

      JSON.stringify(data.apps)

    ];

    await pool.query(query, values);

    res.json({
      ok: true,
      message: "Laptop activity stored"
    });

  } catch (err) {

    console.error("Laptop insert error:", err);

    res.status(500).json({
      ok: false,
      error: "Database insert failed"
    });
  }
}

// --------------------------------------
// GET LAST 20 RECORDS
// --------------------------------------

async function getLatestLaptopData(req, res) {

  try {

    const result = await pool.query(`
      SELECT *
      FROM laptop_activity_15m
      ORDER BY timestamp DESC
      LIMIT 20
    `);

    res.json(result.rows);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: "Fetch failed"
    });
  }
}

// --------------------------------------
// GET DEVICE LIST
// --------------------------------------

async function getLaptopDevices(req, res) {

  const result = await pool.query(`
    SELECT DISTINCT device_name
    FROM laptop_activity_15m
    ORDER BY device_name ASC
  `);

  res.json({
    ok: true,
    count: result.rows.length,
    devices: result.rows.map(r => r.device_name)
  });
}

// --------------------------------------
// GET USAGE BY DATE
// --------------------------------------

async function getLaptopUsageByDate(req, res) {

  const { device_name, date } = req.params;

  const result = await pool.query(`
    SELECT *
    FROM laptop_activity_15m
    WHERE device_name = $1
      AND DATE(timestamp AT TIME ZONE 'Asia/Kolkata') = $2::date
    ORDER BY timestamp ASC
  `, [device_name, date]);

  res.json({
    ok: true,
    device_name,
    date,
    count: result.rows.length,
    data: result.rows
  });
}

// --------------------------------------
// DOWNLOAD JSON BY DATE
// --------------------------------------

async function downloadLaptopUsageByDate(req, res) {

  const { device_name, date } = req.params;

  const result = await pool.query(`
    SELECT *
    FROM laptop_activity_15m
    WHERE device_name = $1
      AND DATE(timestamp AT TIME ZONE 'Asia/Kolkata') = $2::date
    ORDER BY timestamp ASC
  `, [device_name, date]);

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=laptop_${device_name}_${date}.json`
  );

  res.json(result.rows);
}

// --------------------------------------








module.exports = {
  receiveLaptopData,
  getLatestLaptopData,
  getLaptopDevices,
  getLaptopUsageByDate,
  downloadLaptopUsageByDate,

};