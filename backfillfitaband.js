const pool = require("./db");

// ================= PROCESSING HELPERS =================

function bucketSummary(data) {

  const counts = [0, 0, 0, 0, 0];
  let postureChanges = 0;

  for (let i = 0; i < data.length; i++) {

    counts[data[i]]++;

    if (i > 0 && data[i] !== data[i - 1]) {
      postureChanges++;
    }
  }

  const dominant = counts.indexOf(Math.max(...counts));

  const activeMinutes = (counts[3] + counts[4]) * 20 / 60;
  const sedentaryMinutes = (counts[0] + counts[1]) * 20 / 60;

  return {
    dominant,
    activeMinutes,
    sedentaryMinutes,
    postureChanges
  };
}

// ------------------------------------------------------

function bucketTaskEngine(summary, hour) {

  const { dominant, activeMinutes, sedentaryMinutes } = summary;

  if (hour >= 23 || hour <= 5) {

    if (dominant >= 3) return "Go back to sleep";

    return "Maintain sleep";
  }

  if (hour >= 6 && hour <= 9) {

    if (activeMinutes < 3) return "Light morning walk";

    return "Good morning activity";
  }

  if (hour >= 10 && hour <= 18) {

    if (sedentaryMinutes > 10) return "Stand up and stretch";

    return "Posture balanced";
  }

  if (hour >= 19 && hour <= 22) {

    if (activeMinutes > 8) return "Slow down and relax";

    return "Relax mode";
  }

  return "Normal activity";
}

// ======================================================
// BACKFILL PROCESS
// ======================================================

async function backfill() {

  console.log("Starting Fitband Backfill...");

  // 1️⃣ Load all raw data
  const result = await pool.query(`
    SELECT id, bucket, motion_data, created_at
    FROM fitband_activity_logs
    ORDER BY id ASC
  `);

  console.log("Total records:", result.rowCount);

  let inserted = 0;
  let skipped = 0;

  for (const row of result.rows) {

    const { bucket, motion_data, created_at } = row;

    // 2️⃣ Avoid duplicate bucket insights
    const check = await pool.query(
      `
      SELECT id FROM fitband_bucket_insights
      WHERE bucket = $1
      `,
      [bucket]
    );

    if (check.rowCount > 0) {
      skipped++;
      continue;
    }

    // 3️⃣ Analyze bucket
    const summary = bucketSummary(motion_data);

    const { getISTParts } = require('./express-server/utils/timezone');

    const { hour } = getISTParts(created_at);

    const task = bucketTaskEngine(summary, hour);

    const healthState =
      summary.sedentaryMinutes > 10 ? "SEDENTARY" : "ACTIVE";

    // 4️⃣ Insert bucket insight
    await pool.query(
      `
      INSERT INTO fitband_bucket_insights
      (
        bucket,
        dominant_activity,
        active_minutes,
        sedentary_minutes,
        posture_changes,
        suggested_task,
        health_state,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
      [
        bucket,
        summary.dominant,
        summary.activeMinutes,
        summary.sedentaryMinutes,
        summary.postureChanges,
        task,
        healthState,
        created_at
      ]
    );

    // 5️⃣ Insert task history
    await pool.query(
      `
      INSERT INTO fitband_task_log
      (bucket, task, delivered_at)
      VALUES ($1,$2,$3)
      `,
      [bucket, task, created_at]
    );

    inserted++;

    if (inserted % 20 === 0) {
      console.log("Processed:", inserted);
    }
  }

  console.log("Backfill completed");
  console.log("Inserted:", inserted);
  console.log("Skipped:", skipped);

  process.exit();
}

// RUN
backfill();
