const express = require("express");
const router = express.Router();

const { registerDevice } = require("../controllers/registerDevices");

router.post("/register-device", registerDevice);

module.exports = router;