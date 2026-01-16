const { Pool } = require("pg");

const pool = new Pool({
  user: "rachappa",
  host: "localhost",
  database: "usage_db",
  password: "Cbg@123456",
  port: 5432,
});

module.exports = pool;
