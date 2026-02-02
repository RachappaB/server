const express = require("express");
const router = express.Router();

const {
  getCombinedByFilter
} = require("../controllers/combinedController");

// Test
router.get("/", (req, res) => {
  res.send("✅ Combined API Running");
});

// Main API
// Example:
// /api/combined/data?phone_id=xxx&date=2026-01-30
// /api/combined/data?extension_id=yyy
// /api/combined/data?laptop_id=ubuntu_laptop

router.get("/data", getCombinedByFilter);

module.exports = router;
