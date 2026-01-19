const pool = require("../db");

/* -------- 15 MIN BUCKET -------- */

function calcBucket15() {

  const now = new Date();

  const totalMin =
    now.getHours() * 60 +
    now.getMinutes();

  return Math.floor(totalMin / 15);
}

/* -------- INSERT DATA -------- */

async function insertData(req, res) {

  try {

    const body = req.body;

    const bucket = calcBucket15();

    await pool.query(
      `
      INSERT INTO embedded_data
      (
        device_id,
        mpu,
        gps,
        bio,
        bucket_15min
      )
      VALUES ($1,$2,$3,$4,$5)
      `,
      [
        body.d || "ESP32",
        body.mpu || null,
        body.gps || null,
        body.bio || null,
        bucket
      ]
    );

    res.json({
      ok: 1,
      bucket
    });

  } catch (err) {

    console.error("INSERT FAILED:", err.message);

    res.status(500).json({
      ok: 0
    });
  }
}

/* -------- GET LATEST -------- */

async function getLatest(req, res) {

  const r = await pool.query(`
    SELECT *
    FROM embedded_data
    ORDER BY server_time DESC
    LIMIT 1
  `);

  res.json(r.rows[0]);
}

/* -------- DASHBOARD APIs -------- */

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

/* -------- EXPORTS -------- */

module.exports = {
  insertData,
  getLatest,

  getEmbeddedDevices,
  getEmbeddedUsageByDate,
  downloadEmbeddedUsageByDate
};
