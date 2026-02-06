const pool = require("./db");

async function generateDailySummary() {

  console.log("Generating Daily Summaries...");

  const days = await pool.query(`
    SELECT DISTINCT DATE(created_at) as day
    FROM fitband_bucket_insights
    ORDER BY day
  `);

  for (const row of days.rows) {

    const day = row.day;

    // Skip if already generated
    const exists = await pool.query(
      `SELECT id FROM fitband_daily_summary WHERE day=$1`,
      [day]
    );

    if (exists.rowCount > 0) continue;

    const buckets = await pool.query(
      `
      SELECT dominant_activity
      FROM fitband_bucket_insights
      WHERE DATE(created_at)=$1
      `,
      [day]
    );

    let sleep=0, sit=0, stand=0, walk=0, run=0;

    buckets.rows.forEach(b => {

      switch(b.dominant_activity) {

        case 0: sleep += 15; break;
        case 1: sit += 15; break;
        case 2: stand += 15; break;
        case 3: walk += 15; break;
        case 4: run += 15; break;
      }
    });

    // Simple health score
    let score = 0;
    if (sleep >= 420) score += 30;
    if (walk >= 30) score += 30;
    if (sit <= 600) score += 20;
    score += 20;

    await pool.query(
      `
      INSERT INTO fitband_daily_summary
      (
        day,
        sleep_minutes,
        sit_minutes,
        stand_minutes,
        walk_minutes,
        run_minutes,
        health_score
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
      [
        day,
        sleep,
        sit,
        stand,
        walk,
        run,
        score
      ]
    );

    console.log("Inserted daily summary:", day);
  }

  console.log("Daily summary generation completed");
  process.exit();
}

generateDailySummary();
