const pool = require("../db");

const IST_OFFSET_MS = 19800 * 1000;

// ================= HELPERS =================

function bucketSummary(data) {

  const counts = [0,0,0,0,0];
  const labels = ["Sleep", "Sit", "Stand", "Walk", "Run"];
  let postureChanges = 0;

  // Count occurrences and track transitions
  for (let i = 0; i < data.length; i++) {

    counts[data[i]]++;

    if (i > 0 && data[i] !== data[i - 1]) {
      postureChanges++;
    }
  }

  const dominant = counts.indexOf(Math.max(...counts));

  // Each bucket = 15 minutes, each sample = ~20 seconds (45 samples per bucket)
  // Active: walk(3) + run(4), Sedentary: sleep(0) + sit(1), Standing: stand(2)
  const timePerState = {};
  labels.forEach((label, idx) => {
    timePerState[label.toLowerCase()] = Math.floor((counts[idx] * 20) / 60);
  });

  const activeMinutes = Math.floor(((counts[3] + counts[4]) * 20) / 60);
  const sedentaryMinutes = Math.floor(((counts[0] + counts[1]) * 20) / 60);
  const standingMinutes = Math.floor((counts[2] * 20) / 60);

  // Calculate posture stability (low changes = more stable, high = more active/changing)
  const postureStability = Math.round((1 - (postureChanges / data.length)) * 100);

  // Health insights based on activity pattern
  const insights = generateHealthInsights(counts, activeMinutes, sedentaryMinutes, postureChanges, labels[dominant]);

  return {
    dominant,
    dominantLabel: labels[dominant],
    activeMinutes,
    sedentaryMinutes,
    standingMinutes,
    timePerState,
    postureChanges,
    postureStability,
    insights
  };
}

function generateHealthInsights(counts, active, sedentary, changes, dominantLabel) {

  const insights = [];

  // Sedentary warning
  if (sedentary >= 12) {
    insights.push("⚠️ High sitting time - take a walk break soon");
  }

  // Activity recommendation
  if (active === 0) {
    insights.push("💪 No active movement detected - consider a quick walk");
  } else if (active >= 10) {
    insights.push("✅ Good activity level - keep it up!");
  }

  // Posture change analysis
  if (changes > 15) {
    insights.push("🔄 Frequent posture changes - good movement variety");
  } else if (changes < 3) {
    insights.push("⏸️ Low movement - try to change positions more");
  }

  // State-specific insights
  if (dominantLabel === "Sleep" && sedentary > 0) {
    insights.push("😴 Rest period detected");
  } else if (dominantLabel === "Walk") {
    insights.push("🚶 Good walking activity");
  } else if (dominantLabel === "Run") {
    insights.push("🏃 Excellent - high intensity activity!");
  } else if (dominantLabel === "Stand") {
    insights.push("🧍 Standing position maintained");
  }

  return insights.length > 0 ? insights : ["📊 Continue monitoring your activity"];
}

function bucketTaskEngine(summary, hour) {

  if (hour >= 23 || hour <= 5)
    return summary.dominant >= 3 ? "Go back to sleep" : "Maintain rest";

  if (hour >= 6 && hour <= 9)
    return summary.activeMinutes < 3 ? "Morning walk" : "Good activity";

  if (hour >= 10 && hour <= 18)
    return summary.sedentaryMinutes > 10 ? "Stretch" : "Balanced posture";

  if (hour >= 19 && hour <= 22)
    return summary.activeMinutes > 8 ? "Slow down" : "Relax";

  return "Normal movement";
}

// ================= MAIN PROCESS =================

async function runAutomatedAnalysis1() {

  console.log("⚙ Starting Fitband Bucket Processing...");

  const raw = await pool.query(
    `
    SELECT r.id, r.bucket, r.motion_data, r.created_at
    FROM fitband_activity_logs r
    LEFT JOIN fitband_bucket_insights i
      ON r.bucket = i.bucket
     AND r.created_at::date = i.created_at::date
    WHERE i.id IS NULL
    ORDER BY r.id ASC
    `
  );

  console.log("📦 Pending buckets:", raw.rowCount);

  let processed = 0;

  for (const row of raw.rows) {

    try {

      const summary = bucketSummary(row.motion_data);

      const istHour =
        new Date(row.created_at.getTime() + IST_OFFSET_MS).getHours();

      const task = bucketTaskEngine(summary, istHour);

      const healthState =
        summary.sedentaryMinutes > 10 ? "SEDENTARY" : "ACTIVE";

      await pool.query(
        `
        INSERT INTO fitband_bucket_insights
        (
          bucket,
          dominant_activity,
          active_minutes,
          sedentary_minutes,
          standing_minutes,
          posture_changes,
          posture_stability,
          suggested_task,
          health_state,
          health_insights,
          time_sleep,
          time_sit,
          time_stand,
          time_walk,
          time_run,
          created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (bucket, created_at::date) DO NOTHING
        `,
        [
          row.bucket,
          summary.dominant,
          summary.activeMinutes,
          summary.sedentaryMinutes,
          summary.standingMinutes,
          summary.postureChanges,
          summary.postureStability,
          task,
          healthState,
          summary.insights.join(' | '),
          summary.timePerState.sleep,
          summary.timePerState.sit,
          summary.timePerState.stand,
          summary.timePerState.walk,
          summary.timePerState.run,
          row.created_at
        ]
      );

      await pool.query(
        `
        INSERT INTO fitband_task_log
        (bucket, task, delivered_at)
        VALUES ($1,$2,$3)
        `,
        [row.bucket, task, row.created_at]
      );

      processed++;

      console.log("✅ Processed bucket:", row.bucket);

    } catch (err) {

      console.error("❌ Failed bucket:", row.bucket, err.message);
    }
  }

  console.log("🏁 Processing complete. Total:", processed);

  return processed;
}

// ================= EXPORT =================

module.exports = {
  runAutomatedAnalysis1
};
