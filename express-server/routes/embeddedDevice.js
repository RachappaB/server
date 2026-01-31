const express = require("express");
const router = express.Router();

const {
  insertData,
  getLatest,
  getDevices,
  getUsageByDay
} = require("../controllers/embeddedController");


router.post("/data", insertData);
router.get("/last", getLatest);
router.get("/devices", getDevices);
router.get("/usage/day/:device/:date", getUsageByDay);


module.exports = router;
