const express = require("express");
const router = express.Router();
console.log("extension route accessed");
router.get("/", (req, res) => {
  res.send("✅ You are on EXTENSION page");
});

module.exports = router;
