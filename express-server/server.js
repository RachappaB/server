const express = require("express");
const pool = require("./db"); // ✅ added

const app = express();
const PORT = 3000;

app.use(express.json()); // ✅ important for future post requests

app.use("/api/phone", require("./routes/phone"));
app.use("/api/laptop", require("./routes/laptop"));
app.use("/api/extension", require("./routes/extension"));
app.use("/api/embedded", require("./routes/embeddedDevice"));

app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.send(`✅ Home Page (DB Connected) - ${result.rows[0].now}`);
  } catch (err) {
    console.error("❌ DB Error:", err.message);
    res.status(500).send("❌ Database connection failed");
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
