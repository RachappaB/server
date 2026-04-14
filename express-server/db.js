require("dotenv").config();
const { Pool } = require("pg");

// 🔹 Primary DB (racha)
const primaryPool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST_PRIMARY,   // e.g. 192.168.50.2
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

// 🔹 Fallback DB (bacha local or replica)
const fallbackPool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST_SECONDARY, // e.g. 192.168.50.1
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

// 🔹 Health state
let isPrimaryHealthy = true;

// 🔹 Query wrapper
async function query(text, params) {
  try {
    if (isPrimaryHealthy) {
      const res = await primaryPool.query(text, params);
      return res;
    } else {
      throw new Error("Primary marked unhealthy");
    }
  } catch (err) {
    console.error("❌ Primary DB failed:", err.message);

    // mark primary unhealthy temporarily
    isPrimaryHealthy = false;

    try {
      console.log("⚠️ Switching to fallback DB...");
      const res = await fallbackPool.query(text, params);
      return res;
    } catch (fallbackErr) {
      console.error("❌ Fallback DB also failed:", fallbackErr.message);
      throw fallbackErr;
    }
  }
}

// 🔹 Periodic health check (restore primary)
setInterval(async () => {
  try {
    await primaryPool.query("SELECT 1");
    if (!isPrimaryHealthy) {
      console.log("✅ Primary DB recovered");
    }
    isPrimaryHealthy = true;
  } catch (err) {
    console.log("⚠️ Primary DB still down");
  }
}, 5000);

// 🔹 Export API
module.exports = {
  query,
  primaryPool,
  fallbackPool,
};