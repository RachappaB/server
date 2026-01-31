const pool = require("../db");

/* ==============================
   INSERT DEVICE DATA
================================ */

async function insertData(req, res) {

  try {

    const body = req.body;

    /*
      REQUIRED:
        d         -> device id
        activity  -> activity label

      OPTIONAL:
        lat, lng, alt, sat, hdop, gps_time
    */

    if (!body.d || !body.activity) {

      return res.status(400).json({
        ok: 0,
        error: "device_id (d) and activity required"
      });
    }

    // ------------------------------
    // TIME HANDLING
    // ------------------------------

    let eventTime;

    // Prefer GPS time if present
    if (body.gps_time) {

      eventTime = convertUTCtoIST(body.gps_time);

    } else {

      // fallback to server receive time
      eventTime = new Date();
    }

    const bucket = calculate15MinBucket(eventTime);
    const bucketDate = eventTime.toISOString().slice(0, 10);

    // ------------------------------
    // INSERT DATA
    // ------------------------------

    const insertQuery = `
      INSERT INTO device_activity_log
      (
        device_id,
        activity,
        latitude,
        longitude,
        altitude,
        satellites,
        hdop,
        gps_time,
        bucket_15min,
        bucket_date,
        created_at
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id
    `;

    const values = [
      body.d,
      body.activity,

      body.lat || null,
      body.lng || null,
      body.alt || 0,

      body.sat || 0,
      body.hdop || 99,

      body.gps_time ? eventTime : null,

      bucket,
      bucketDate,

      eventTime
    ];

    const result = await pool.query(insertQuery, values);

    res.json({
      ok: 1,
      id: result.rows[0].id,
      device: body.d,
      activity: body.activity,
      gps_used: !!body.gps_time,
      time: eventTime
    });

  } catch (err) {

    console.error("INSERT ERROR:", err);

    res.status(500).json({
      ok: 0,
      error: "Insert failed"
    });
  }
}

/* ==============================
   GET LAST DEVICE STATUS
================================ */

async function getLatest(req, res) {

  try {

    const device = req.query.device_id;

    if (!device) {
      return res.json({});
    }

    const result = await pool.query(`
      SELECT *
      FROM device_activity_log
      WHERE device_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [device]);

    res.json(result.rows[0] || {});

  } catch (err) {

    console.error("LATEST FETCH ERROR:", err);

    res.status(500).json({
      ok: false,
      error: "Fetch failed"
    });
  }
}

/* ==============================
   GET DEVICE LIST
================================ */

async function getDevices(req, res) {

  try {

    const result = await pool.query(`
      SELECT DISTINCT device_id
      FROM device_activity_log
      ORDER BY device_id ASC
    `);

    res.json({
      ok: true,
      devices: result.rows.map(r => r.device_id)
    });

  } catch (err) {

    console.error("DEVICE FETCH ERROR:", err);

    res.status(500).json({
      ok: false,
      error: "Failed to fetch devices"
    });
  }
}

/* ==============================
   GET DAILY USAGE
================================ */

async function getUsageByDay(req, res) {

  try {

    const { device, date } = req.params;

    const result = await pool.query(`
      SELECT
        activity,
        latitude,
        longitude,
        gps_time,
        created_at
      FROM device_activity_log
      WHERE device_id = $1
        AND bucket_date = $2::date
      ORDER BY created_at ASC
    `, [device, date]);

    res.json({
      ok: true,
      device,
      date,
      count: result.rows.length,
      data: result.rows
    });

  } catch (err) {

    console.error("DAY FETCH ERROR:", err);

    res.status(500).json({
      ok: false,
      error: "Failed to fetch day data"
    });
  }
}

/* ==============================
   HELPERS
================================ */

function calculate15MinBucket(dateObj) {

  const hours = dateObj.getHours();
  const minutes = dateObj.getMinutes();

  const totalMinutes = (hours * 60) + minutes;

  return Math.floor(totalMinutes / 15) + 1;
}

function convertUTCtoIST(utcString) {

  const d = new Date(utcString);

  // UTC → IST
  d.setHours(d.getHours() + 5);
  d.setMinutes(d.getMinutes() + 30);

  return d;
}

/* ==============================
   EXPORTS
================================ */

module.exports = {
  insertData,
  getLatest,
  getDevices,
  getUsageByDay
};
