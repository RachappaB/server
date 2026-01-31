const pool = require("../db")   ;

// ===============================
// INSERT MPU TRAINING DATA
// ===============================

async function insertMpuBatch(req, res) {

  console.log("=================================");
  console.log("[MPU-AI] DATA RECEIVED");
  console.log("Time:", new Date().toLocaleString("en-IN"));
  console.log("=================================");

  try {

    const buffer = req.body;

    if (!buffer || buffer.length === 0) {
      console.log("[ERROR] Empty buffer");
      return res.status(400).json({ ok: 0, error: "Empty payload" });
    }

    console.log("[RAW SIZE]", buffer.length, "bytes");

    // ---------- PROTOCOL FORMAT ----------
    // ESP32 sends:
    // HEADER:
    // uint16 samples
    // uint8 label
    //
    // BODY:
    // float ax ay az gx gy gz  (6 floats per sample)

    let offset = 0;

    const samples = buffer.readUInt16LE(offset);
    offset += 2;

    const label = buffer.readUInt8(offset);
    offset += 1;

    console.log("[DATA] Samples:", samples);
    console.log("[DATA] Label:", label);

    const ax = [];
    const ay = [];
    const az = [];
    const gx = [];
    const gy = [];
    const gz = [];

    for (let i = 0; i < samples; i++) {

      ax.push(buffer.readFloatLE(offset)); offset += 4;
      ay.push(buffer.readFloatLE(offset)); offset += 4;
      az.push(buffer.readFloatLE(offset)); offset += 4;

      gx.push(buffer.readFloatLE(offset)); offset += 4;
      gy.push(buffer.readFloatLE(offset)); offset += 4;
      gz.push(buffer.readFloatLE(offset)); offset += 4;
    }

    // ---------- DATABASE INSERT ----------

    const query = `
      INSERT INTO mpu_ai_dataset
      (
        device_id,
        ax, ay, az,
        gx, gy, gz,
        label
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id, server_time
    `;

    const values = [
      "mpu_unit_01",
      ax, ay, az,
      gx, gy, gz,
      label
    ];

    const result = await pool.query(query, values);

    console.log("[DB] INSERT OK ID:", result.rows[0].id);

    res.json({ ok: 1 });

  } catch (err) {

    console.error("❌ MPU INSERT ERROR");
    console.error(err);

    res.status(500).json({
      ok: 0,
      error: "Insert failed"
    });
  }
}


// ===============================
// GET LATEST (DEBUG)
// ===============================

async function getLatestMpu(req, res) {

  const r = await pool.query(`
    SELECT *
    FROM mpu_ai_dataset
    ORDER BY server_time DESC
    LIMIT 1
  `);

  res.json(r.rows[0] || {});
}

module.exports = {
  insertMpuBatch,
  getLatestMpu
};
