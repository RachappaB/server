const express = require("express");
const pool = require("./db");
const path = require("path");
const morgan = require("morgan");

const cors = require("cors");
require('dotenv').config(); 
const { startFcmScheduler } = require("./fcmScheduler");
const { startNotificationEngine } = require("./notificationEngine");
const app = express();
const PORT = process.env.PORT || 3000;
const cron = require('node-cron');

// ✅ Trust reverse proxy headers
app.set("trust proxy", true);





app.use(cors({
  origin: [
    "https://sunita.space",
    "https://data.sunita.space"
  ],
  methods: ["GET","POST"],
  credentials: true
}));

app.use("/api/mpu-ai/data",
  express.raw({ type: "application/octet-stream", limit: "200kb" })
);





app.use(morgan(":date[iso] :method :url :status :response-time ms"));

const compression = require("compression");
app.use(compression()); // ← add this line

app.use(express.json({ limit: "10mb" }));



// app.use(express.static(path.join(__dirname, "HTML")));
// Replace your existing express.static line with:
app.use(express.static(path.join(__dirname, "HTML"), {
  maxAge: "1h",        // browsers cache CSS/JS/images for 1 hour
  etag: true,
  lastModified: true,
}));

// ✅ Health check
app.get("/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.status(200).send(`✅ Server OK | DB OK | ${result.rows[0].now}`);
  } catch (err) {
    console.error("❌ DB Error:", err.message);
    res.status(500).send("❌ Server OK | DB FAILED");
  }
});

// ✅ Privacy Policy Route (MUST BE ABOVE 404)
app.get("/privacy.html", (req, res) => {

  const filePath = path.join(__dirname, "HTML", "privacy.html");

  res.sendFile(filePath, err => {
    if (err) {
      console.error("Privacy file error:", err);
      res.status(500).send("Privacy policy not available");
    }
  });

});

// ✅ API Routes for data collection
app.use("/api/phone", require("./routes/phone"));
app.use("/api/phonev2", require("./routes/phonev2"));
app.use("/api/phonev4", require("./routes/phonev4"));

app.use("/api/user", require("./routes/user"));
app.use("/api/laptop", require("./routes/laptop"));
app.use("/api/extension", require("./routes/extension"));
app.use("/api/fitband", require("./routes/fitband"));
app.use("/api/admin", require("./routes/admin"));

// data  getting routes
app.use("/api/combined", require("./routes/combinedRoute"));
app.use("/api/combinedfilter",require("./routes/combinedfillterRoute"));

//gemini working test route 
app.use("/api/gemini",require("./routes/geminiroute"));
app.use("/api/gps",require("./routes/gps"));  


// // ✅ CRON JOB: AI Analysis every 15 minutes
// cron.schedule('*/15 * * * *', async () => {
//     console.log('⏰ Cron Triggered: Starting 15-minute Productivity Analysis...');
//     try {
//       console.log("🤖 Running automated AI analysis via cron");
//         await runAutomatedAnalysis();
//         console.log("✅ Cron Analysis Completed Successfully");
//     } catch (err) {
//       console.log("❌ Cron Analysis Failed");
//         console.error('❌ Cron Job Failed:', err);
//     }
// });


// cron.schedule("*/5 * * * *", async () => {

//   console.log("⏰ Cron Triggered: Fitband Analysis");

//   try {

//     const count = await runAutomatedAnalysis1();

//     console.log("✅ Cron Completed. Buckets:", count);

//   } catch (err) {

//     console.error("❌ Cron Failed:", err);
//   }

// });










// ── Add to server.js ──────────────────────────────────────────────────────

// 1. Require at top:
const instanceId = parseInt(process.env.NODE_APP_INSTANCE || "0");

// 2. Inside instanceId === 0 block:
if (instanceId === 0) {
  startFcmScheduler();
  startNotificationEngine();   // IST cron, fires every minute
  console.log("✅ Notification engine started");
}

// 3. Install:  npm install cron-parser




// ✅ 404 handler (ALWAYS LAST)
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

// ✅ Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);
  res.status(500).json({ ok: false, error: "Internal server error" });
});


app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});