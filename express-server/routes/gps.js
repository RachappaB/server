const express = require("express");
const router = express.Router();


// Serve UI
router.post("/", (req,res)=>{
    console.log("🚀 Serving GPS HTML page") ;
    console.log(req.body);
    res.status(200).send("GPS UI served");
});

// APIs

module.exports = router;
