const pool = require("../db");

/* =========================
 DEVICE REGISTRATION
========================= */

async function registerDevice(req, res) {

  console.log("📥 REGISTER REQUEST:", req.body);

  const { email, device_id, device_name, user_agent } = req.body;

  if (!email || !device_id) {
    console.error("❌ REGISTER FAILED: Missing email or device_id");
    return res.status(400).json({ error: "email and device_id required" });
  }

  try {

    await pool.query(
      `
      INSERT INTO extension_devices
      (email, device_id, device_name, user_agent)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (device_id)
      DO UPDATE SET last_seen = NOW()
      `,
      [email, device_id, device_name, user_agent]
    );

    console.log("✅ DEVICE REGISTERED:", email, device_id);

    res.json({ ok: true });

  } catch (err) {

    console.error("❌ REGISTER DB ERROR:", err.message);
    res.status(500).json({ error: "Registration failed" });
  }
}

/* =========================
 BUCKET UPLOAD
========================= */

async function uploadBucket(req, res) {

  console.log("📦 BUCKET UPLOAD RECEIVED:");
  console.log(JSON.stringify(req.body, null, 2));

  const {
    email,
    device_id,
    date,
    bucket,
    domains
  } = req.body;

  if (!email || !device_id || bucket === undefined) {
    console.error("❌ BUCKET INVALID PAYLOAD");
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {

    /* Verify device exists */

    const check = await pool.query(
      `
      SELECT 1 FROM extension_devices
      WHERE email=$1 AND device_id=$2
      `,
      [email, device_id]
    );

    if (check.rowCount === 0) {
      console.error("❌ DEVICE NOT REGISTERED:", email, device_id);
      return res.status(403).json({ error: "Unregistered device" });
    }

    console.log("✅ DEVICE VERIFIED");

    /* Insert bucket */

    await pool.query(
      `
      INSERT INTO extension_usage_stream
      (device_id, usage_date, bucket_index, domains)
      VALUES ($1,$2,$3,$4::jsonb)
      ON CONFLICT (device_id, usage_date, bucket_index)
      DO UPDATE SET
        domains = EXCLUDED.domains,
        received_at = NOW()
      `,
      [device_id, date, bucket, JSON.stringify(domains || {})]
    );

    console.log(
      "✅ BUCKET STORED:",
      "device:", device_id,
      "date:", date,
      "bucket:", bucket
    );

    res.json({ ok: true });

  } catch (err) {

    console.error("❌ BUCKET INSERT ERROR:", err.message);

    res.status(500).json({
      error: "Bucket upload failed",
      details: err.message
    });
  }
}



/* =========================
 GET DATA  for extension usage  
================= */

async function verifyDevice(req, res) {

  const { email, device_id } = req.body;

  if (!email || !device_id) {
    return res.json({ registered: false });
  }

  try {

    const result = await pool.query(
      `
      SELECT 1 FROM extension_devices
      WHERE email=$1 AND device_id=$2
      `,
      [email, device_id]
    );

    if (result.rowCount > 0) {
      return res.json({ registered: true });
    }

    return res.json({ registered: false });

  } catch (err) {

    console.error("❌ VERIFY ERROR:", err.message);

    res.status(500).json({
      registered: false,
      error: "verification failed"
    });
  }
}

/* =========================
 GET DATA
========================= */

async function getBuckets(req, res) {

  const { email } = req.params;

  console.log("📤 FETCH REQUEST FOR EMAIL:", email);

  try {

    const result = await pool.query(
      `
      SELECT eus.*
      FROM extension_usage_stream eus
      JOIN extension_devices ed
        ON ed.device_id = eus.device_id
      WHERE ed.email = $1
      ORDER BY usage_date DESC, bucket_index ASC
      `,
      [email]
    );

    console.log("✅ FETCH RESULT COUNT:", result.rows.length);

    res.json({
      ok: true,
      count: result.rows.length,
      data: result.rows
    });

  } catch (err) {

    console.error("❌ FETCH ERROR:", err.message);

    res.status(500).json({
      error: "Fetch failed"
    });
  }
}

async function getDevices(req, res) {

  const result = await pool.query(`
    SELECT DISTINCT device_id
    FROM extension_devices
    ORDER BY device_id ASC
  `);

  res.json({
    ok: true,
    count: result.rows.length,
    devices: result.rows.map(r => r.device_id)
  });
}


async function getUsageByDeviceAndDate(req, res) {

  const { device_id, date } = req.params;

  const result = await pool.query(`
    SELECT
      device_id,
      usage_date,
      bucket_index,
      domains,
      received_at
    FROM extension_usage_stream
    WHERE device_id = $1
      AND usage_date = $2::date
    ORDER BY bucket_index ASC
  `, [device_id, date]);

  res.json({
    ok: true,
    device_id,
    date,
    count: result.rows.length,
    data: result.rows
  });
}


async function downloadUsageByDate(req, res) {

  const { device_id, date } = req.params;

  const result = await pool.query(`
    SELECT
      device_id,
      usage_date,
      bucket_index,
      domains,
      received_at
    FROM extension_usage_stream
    WHERE device_id = $1
      AND usage_date = $2::date
    ORDER BY bucket_index ASC
  `, [device_id, date]);

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=extension_${device_id}_${date}.json`
  );

  res.json(result.rows);
}





module.exports = {
  registerDevice,
  uploadBucket,
  getBuckets,
  verifyDevice,

  // new dashboard APIs
  getDevices,
  getUsageByDeviceAndDate,
  downloadUsageByDate
};

