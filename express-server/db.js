require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "usage_db",
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
});

pool.on("connect", () => {
  console.log("✅ PostgreSQL connected");
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL pool error:", err);
});

module.exports = pool;