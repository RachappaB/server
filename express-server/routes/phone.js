const express = require("express");
const router = express.Router();
console.log("phone route accessed");
router.get("/", (req, res) => {
  res.send("✅ You are on PHONE page 1");
});

module.exports = router;
