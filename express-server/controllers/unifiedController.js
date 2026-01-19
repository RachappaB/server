const pool = require("../db");

async function getUnifiedBuckets(req, res) {

  const { date } = req.params;

  // =====================
  // PHONE BUCKETS
  // =====================

  const phone = await pool.query(`
    SELECT ub.bucket_index
    FROM usage_days ud
    JOIN usage_buckets ub ON ub.day_id = ud.id
    WHERE ud.usage_date = $1
    GROUP BY ub.bucket_index
  `, [date]);

  // =====================
  // EXTENSION BUCKETS
  // =====================

  const extension = await pool.query(`
    SELECT bucket_index
    FROM extension_usage_stream
    WHERE usage_date = $1
    GROUP BY bucket_index
  `, [date]);

  // =====================
  // LAPTOP BUCKETS
  // =====================

  const laptop = await pool.query(`
    SELECT DISTINCT
      FLOOR(EXTRACT(EPOCH FROM timestamp)::int / 900) % 96 AS bucket
    FROM laptop_activity_15m
    WHERE DATE(timestamp) = $1
  `, [date]);

  // =====================
  // EMBEDDED BUCKETS
  // =====================

  const embedded = await pool.query(`
    SELECT bucket_15min
    FROM embedded_data
    WHERE bucket_date = $1
    GROUP BY bucket_15min
  `, [date]);

  // =====================
  // Convert to Sets
  // =====================

  const phoneSet = new Set(phone.rows.map(r => r.bucket_index));
  const extSet = new Set(extension.rows.map(r => r.bucket_index));
  const lapSet = new Set(laptop.rows.map(r => Number(r.bucket)));
  const embSet = new Set(embedded.rows.map(r => r.bucket_15min));

  // =====================
  // Build 96 Bucket Timeline
  // =====================

  const timeline = [];

  for (let i = 0; i < 96; i++) {

    timeline.push({
      bucket: i,

      phone: phoneSet.has(i) ? 1 : 0,
      extension: extSet.has(i) ? 1 : 0,
      laptop: lapSet.has(i) ? 1 : 0,
      embedded: embSet.has(i) ? 1 : 0
    });
  }

  res.json({
    ok: true,
    date,
    buckets: timeline
  });
}

module.exports = {
  getUnifiedBuckets
};
