const express = require("express");
const router = express.Router();
const pool = require("../db");

// ================================
// GET MOTION DATA FOR ONE DAY
// ================================

router.get("/:date", async (req, res) => {

  try {

    const date = req.params.date;

    // midnight to midnight range
    const start = `${date} 00:00:00`;
    const end   = `${date} 23:59:59`;

    const result = await pool.query(`
      SELECT
        latitude,
        longitude,
        motion,
        gps_enabled,
        to_timestamp(device_time/1000) AS time
      FROM gps_logs
      WHERE to_timestamp(device_time/1000)
            BETWEEN $1 AND $2
      ORDER BY device_time ASC
    `, [start, end]);

    res.json({
      count: result.rows.length,
      rows: result.rows
    });

  } catch (err) {

    console.error("Timeline Error:", err);
    res.status(500).json({ error: "server error" });

  }

});

module.exports = router;
