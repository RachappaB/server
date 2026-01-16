const express = require("express");
const router = express.Router();
console.log("embedded device route accessed");
router.get("/", (req, res) => {
  res.send("✅ You are on EMBEDDED DEVICE page");
});

module.exports = router;
