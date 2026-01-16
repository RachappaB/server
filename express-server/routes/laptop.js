const express = require("express");
const router = express.Router();
console.log("Laptop route accessed");
router.get("/", (req, res) => {
  res.send("✅ You are on LAPTOP page");
});

module.exports = router;
