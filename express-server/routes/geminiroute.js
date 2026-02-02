require('dotenv').config(); // This MUST be the first line
const express = require("express");
const router = express.Router();

const {runAutomatedAnalysis} =require("../controllers/geminicontroller")


router.get("/", runAutomatedAnalysis);

module.exports = router;
