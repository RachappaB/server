const express = require("express");
const pool = require("./db");
const { startFcmScheduler } = require("./fcmScheduler");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));

// ✅ Health check (DB test)
app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.status(200).send(`✅ Server OK | DB OK | ${result.rows[0].now}`);
  } catch (err) {
    console.error("❌ DB Error:", err.message);
    res.status(500).send("❌ Server OK | DB FAILED");
  }
});

// ✅ Routes
app.use("/api/phone", require("./routes/phone"));
app.use("/api/laptop", require("./routes/laptop"));
app.use("/api/extension", require("./routes/extension"));
app.use("/api/embedded", require("./routes/embeddedDevice"));
startFcmScheduler();

// ✅ 404 handler
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

// ✅ Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
