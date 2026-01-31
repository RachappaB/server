const express = require("express");
const router = express.Router();

const {
  insertMpuBatch,
  getLatestMpu
} = require("../controllers/mpuAiController");

// Health test
router.get("/", (req, res) => {
  console.log("[MPU-AI] Route online");
  res.json({ ok: 1, msg: "MPU AI API Online" });
});

// ESP32 sends training batch here
router.post("/data", insertMpuBatch);

// Debug
router.get("/latest", getLatestMpu);

module.exports = router;
