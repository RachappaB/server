const express = require("express");
const router = express.Router();

const {getCombinedByFilter1}  =require("../controllers/combinedfiller")

// Test
router.get("/", (req, res) => {
  res.send("✅ Combined API Running");
});

// Main API
// Example:
// /api/combined/data?phone_id=xxx&date=2026-01-30
// /api/combined/data?extension_id=yyy
// /api/combined/data?laptop_id=ubuntu_laptop

router.get("/data", getCombinedByFilter1);

module.exports = router;
