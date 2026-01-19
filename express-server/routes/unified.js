const express = require("express");
const router = express.Router();

const { getUnifiedBuckets } = require("../controllers/unifiedController");

router.get("/buckets/:date", getUnifiedBuckets);

module.exports = router;
