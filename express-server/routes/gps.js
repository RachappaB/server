const express = require("express");
const router = express.Router();
const pool = require("../db");

// =============================
// RECEIVE GPS DATA
// =============================

router.post("/", async (req, res) => {

  console.log("Incoming GPS:", req.body);

  try {

    const {
      latitude,
      longitude,
      motion,
      gps_enabled,
      device_time
    } = req.body;

    const query = `
      INSERT INTO gps_logs
      (latitude, longitude, motion, gps_enabled, device_time)
      VALUES ($1, $2, $3, $4, $5)
    `;

    await pool.query(query, [
      latitude ?? null,
      longitude ?? null,
      motion ?? null,
      gps_enabled ?? true,
      device_time ?? Date.now()
    ]);

    res.status(200).json({ status: "success" });

  } catch (err) {

    console.error("DB ERROR:", err);

    res.status(500).json({ status: "error" });
  }

});


// =============================
// SIMPLE TEST ROUTE
// =============================

router.get("/", (req, res) => {
  res.send("GPS API Working");
});

module.exports = router;
