require('dotenv').config();
const pool = require("../db");
const axios = require("axios");

// ================= CONFIG =================

const CONFIG = {
  OLLAMA_URL: "http://10.10.3.83:11434/api/chat",
  MODEL_NAME: "llama3.1:8b",
  TIMEZONE: "Asia/Kolkata",
  DEVICE_IDS: {
    PHONE: process.env.DEVICE_ID_PHONE || "7a9d652fd4ee0d50",
    EXTENSION: process.env.DEVICE_ID_EXTENSION || "ext_bfe15def-a7f3-4700-a",
    LAPTOP: process.env.DEVICE_ID_LAPTOP || "ubuntu_laptop"
  }
};

// ================= TIME CONTEXT =================

function getTimeContext() {

  console.log("⏰ Calculating time context...");

  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CONFIG.TIMEZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

  const parts = formatter.formatToParts(now);
  const get = (t) => Number(parts.find(p => p.type === t).value);

  const hours = get("hour");
  const minutes = get("minute");

  const currentBucket = Math.floor((hours * 60 + minutes) / 15);

  let queryBucket = currentBucket - 1;
  const targetDateObj = new Date(now);

  if (queryBucket < 0) {
    queryBucket = 95;
    targetDateObj.setDate(targetDateObj.getDate() - 1);
  }

  if (hours < 4) {
    targetDateObj.setDate(targetDateObj.getDate() - 1);
  }

  const targetDate = targetDateObj.toLocaleDateString("en-CA");

  console.log("✅ Time context:", { targetDate, queryBucket });

  return { targetDate, queryBucket };
}

// ================= FETCH CONTEXT =================

async function fetchContextData(targetDate, queryBucket) {

  console.log("📥 Fetching context data...");
  console.log("DATE:", targetDate, "BUCKET:", queryBucket);

  const query = `
WITH plan AS (
  SELECT 'MORNING_PLAN' AS source_type,
         jsonb_build_object(
           'primary_goal', primary_goal,
           'secondary_goal', secondary_goal
         ) AS data
  FROM morning_plans
  WHERE created_at::date = $1
  ORDER BY created_at DESC
  LIMIT 1
),

usage AS (

  SELECT 'PHONE' AS source_type, ub.apps::jsonb AS data
  FROM usage_buckets ub
  JOIN usage_days ud ON ub.day_id = ud.id
  WHERE ud.device_id = $2
    AND ud.usage_date = $1
    AND ub.bucket_index = $5

  UNION ALL

  SELECT 'EXTENSION' AS source_type, domains::jsonb AS data
  FROM extension_usage_stream
  WHERE device_id = $3
    AND usage_date = $1
    AND bucket_index = $5

  UNION ALL

  SELECT 'LAPTOP' AS source_type, apps::jsonb AS data
  FROM laptop_activity_15m
  WHERE device_name = $4
    AND (timestamp AT TIME ZONE $6)::date = $1
    AND bucket_15min_id = $5
)

SELECT * FROM plan
UNION ALL
SELECT * FROM usage;
`;

  const values = [
    targetDate,
    CONFIG.DEVICE_IDS.PHONE,
    CONFIG.DEVICE_IDS.EXTENSION,
    CONFIG.DEVICE_IDS.LAPTOP,
    queryBucket,
    CONFIG.TIMEZONE
  ];

  console.log("📡 Running SQL query...");

  const { rows } = await pool.query(query, values);

  console.log("✅ Rows fetched:", rows.length);
  console.log("📦 Raw rows:", JSON.stringify(rows, null, 2));

  return rows;
}

// ================= OLLAMA =================

async function getAnalysisFromAI(morningPlan, usageRows) {

  console.log("🤖 Sending data to Ollama...");
  console.log("Morning plan:", JSON.stringify(morningPlan.data));
  console.log("Usage rows:", JSON.stringify(usageRows));

  const prompt = `
You are a strict productivity auditor.

Target Goals:
${JSON.stringify(morningPlan.data)}

Recent Activity:
${JSON.stringify(usageRows)}

Return ONLY valid JSON.
Use DOUBLE QUOTES only.
No markdown.
No commentary.
`;

  const response = await axios.post(CONFIG.OLLAMA_URL, {
    model: CONFIG.MODEL_NAME,
    messages: [{ role: "user", content: prompt }],
    format: "json",
    stream: false
  }, { timeout: 60000 });

  console.log("✅ Ollama responded");

  const raw = response.data.message.content;

  console.log("📥 RAW AI RESPONSE:");
  console.log(raw);

  let parsed;

  try {

    parsed = JSON.parse(raw);
    console.log("✅ AI JSON parsed normally");

  } catch (err) {

    console.log("⚠️ JSON parse failed — attempting fix");

    const fixed = raw
      .replace(/(\w+):/g, '"$1":')
      .replace(/'/g, '"');

    console.log("🔧 Fixed AI JSON:");
    console.log(fixed);

    parsed = JSON.parse(fixed);

    console.log("✅ AI JSON parsed after fix");
  }

  console.log("📊 Final AI object:", JSON.stringify(parsed, null, 2));

  return parsed;
}

// ================= MAIN CRON =================

async function runAutomatedAnalysis(req, res) {

  console.time("⏱️ Analysis Duration");

  try {

    console.log("🚀 Starting automated analysis...");

    const { targetDate, queryBucket } = getTimeContext();

    console.log("➡️ Step 1: Fetching DB context");

    const rows = await fetchContextData(targetDate, queryBucket);

    console.log("➡️ Step 2: Separating plan + usage");

    const morningPlan = rows.find(r => r.source_type === "MORNING_PLAN");

    const usageRows = rows
      .filter(r => r.source_type !== "MORNING_PLAN")
      .filter(r => r.data && Object.keys(r.data).length > 0)
      .map(r => ({ source: r.source_type, data: r.data }));

    console.log("Morning plan found:", !!morningPlan);
    console.log("Usage rows count:", usageRows.length);

    if (!morningPlan) {
      console.log("⏭️ No morning plan — stopping");
      return;
    }

    console.log("➡️ Step 3: Calling Ollama");

    let aiAnalysis;

    try {

      aiAnalysis = await getAnalysisFromAI(morningPlan, usageRows);

    } catch (err) {

      console.error("❌ AI CALL FAILED:", err.message);

      aiAnalysis = {
        bad_review: null,
        suggestion: null,
        guidance: null,
        remark: "AI_PARSE_FAILED",
        problem: null,
        motion: null,
        health: null,
        roadmap: null,
        topics_to_address: [],
        followed_previous_advice: false
      };
    }

    console.log("➡️ Step 4: Preparing DB insert");

    const insertValues = [

      targetDate,
      queryBucket,

      JSON.stringify(morningPlan.data),
      JSON.stringify(usageRows),

      aiAnalysis.bad_review ?? null,
      aiAnalysis.suggestion ?? null,
      aiAnalysis.guidance ?? null,
      aiAnalysis.remark ?? null,
      aiAnalysis.problem ?? null,

      aiAnalysis.followed_previous_advice ?? false,

      aiAnalysis.motion ?? null,
      aiAnalysis.health ?? null,
      aiAnalysis.roadmap ?? null,

      JSON.stringify(aiAnalysis.topics_to_address ?? []),
      JSON.stringify(aiAnalysis)
    ];

    console.log("📤 Insert values preview:");
    console.log(insertValues);

    console.log("➡️ Step 5: Writing to DB");

    await pool.query(`
INSERT INTO gemini_analysis_logs
(
 activity_date,
 bucket_index,
 morning_plan,
 sent_input_data,
 bad_review,
 suggestion,
 guidance,
 remark,
 problem,
 followed_previous_advice,
 motion,
 health,
 roadmap,
 topics_to_address,
 full_response
)
VALUES
($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
`, insertValues);

    console.log("✅ Analysis Saved Successfully");

    if (res) res.json({ ok: true });

  } catch (err) {

    console.error("❌ FINAL ERROR:", err.message);
    console.error(err);

    if (res) res.status(500).json({ ok: false });

  } finally {

    console.timeEnd("⏱️ Analysis Duration");

  }
}

module.exports = { runAutomatedAnalysis };
