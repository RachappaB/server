const pool = require("../db");

/* ============================
   INSERT DATA
============================ */

async function insertData(req, res) {

  try {

    const body = req.body;

    console.log("Embedded Data Received:", body);

    /* -------- BASIC VALIDATION -------- */

    if (!body.d) {
      return res.status(400).json({ ok: 0, error: "Missing device_id" });
    }

    if (!Array.isArray(body.gps) || body.gps.length !== 6) {
      return res.status(400).json({ ok: 0, error: "Invalid GPS payload" });
    }

    if (!Array.isArray(body.mpu) || body.mpu.length !== 60) {
      return res.status(400).json({ ok: 0, error: "Invalid MPU payload" });
    }

    if (!Array.isArray(body.bio) || body.bio.length !== 3) {
      return res.status(400).json({ ok: 0, error: "Invalid BIO payload" });
    }

    /* -------- DATABASE INSERT -------- */

    const query = `
      INSERT INTO embedded_data
      (
        device_id,
        mpu,
        gps,
        bio
      )
      VALUES
      (
        $1,
        $2::smallint[],
        $3::double precision[],
        $4::real[]
      )
      RETURNING id, server_time, bucket_15min, bucket_date
    `;

    const values = [
      body.d,
      body.mpu,
      body.gps,
      body.bio
    ];

    const result = await pool.query(query, values);

    res.json({
      ok: 1,
      inserted: result.rows[0]
    });

  } catch (err) {

    console.error("INSERT FAILED:", err);

    res.status(500).json({
      ok: 0,
      error: "Database insert failed"
    });
  }
}

/* ============================
   GET LATEST
============================ */

async function getLatest(req, res) {

  const r = await pool.query(`
    SELECT *
    FROM embedded_data
    ORDER BY server_time DESC
    LIMIT 1
  `);

  res.json(r.rows[0] || {});
}

/* ============================
   LIST DEVICES
============================ */

async function getEmbeddedDevices(req, res) {

  const result = await pool.query(`
    SELECT DISTINCT device_id
    FROM embedded_data
    ORDER BY device_id ASC
  `);

  res.json({
    ok: true,
    count: result.rows.length,
    devices: result.rows.map(r => r.device_id)
  });
}

/* ============================
   GET ONE DAY DATA
============================ */

async function getEmbeddedUsageByDate(req, res) {

  const { device_id, date } = req.params;

  const result = await pool.query(`
    SELECT *
    FROM embedded_data
    WHERE device_id = $1
      AND bucket_date = $2::date
    ORDER BY bucket_15min ASC
  `, [device_id, date]);

  res.json({
    ok: true,
    device_id,
    date,
    count: result.rows.length,
    data: result.rows
  });
}

/* ============================
   DOWNLOAD ONE DAY
============================ */

async function downloadEmbeddedUsageByDate(req, res) {

  const { device_id, date } = req.params;

  const result = await pool.query(`
    SELECT *
    FROM embedded_data
    WHERE device_id = $1
      AND bucket_date = $2::date
    ORDER BY bucket_15min ASC
  `, [device_id, date]);

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=embedded_${device_id}_${date}.json`
  );

  res.json(result.rows);
}

/* ============================
   EXPORTS
============================ */

module.exports = {
  insertData,
  getLatest,
  getEmbeddedDevices,
  getEmbeddedUsageByDate,
  downloadEmbeddedUsageByDate
};
