const express = require("express");
const router = express.Router();
const path = require("path");

const {
 saveMorning,
 saveNight,
 saveEmotion
} = require("../controllers/thoughtsController");

// Serve UI
router.get("/", (req,res)=>{
 res.sendFile(path.join(__dirname,"../HTML/thoughts.html"));
});

// APIs
router.post("/morning", saveMorning);
router.post("/night", saveNight);
router.post("/emotion", saveEmotion);

module.exports = router;
