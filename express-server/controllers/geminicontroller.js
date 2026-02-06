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
  const getPart = (t) => {
    const part = parts.find(p => p.type === t);
    return part ? Number(part.value) : 0;
  };

  let hours = getPart("hour");
  const minutes = getPart("minute");

  // Some locales/date-formatters may return 24 for midnight (end of day).
  // Normalize hours into 0-23 range and compute total minutes modulo 1440
  if (hours >= 24) hours = hours % 24;

  const totalMinutes = (hours * 60 + minutes) % 1440;
  const currentBucket = Math.floor(totalMinutes / 15);

  // Ensure bucket index is always in 0..95
  let queryBucket = (currentBucket - 1 + 96) % 96;
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

// ================= HELPER: FORMAT DATA AS TEXT =================

function formatDataAsText(bucket, morningPlan, usageRows, fitbandBucket, previousAnalysis) {
  let text = "";

  text += `=== BUCKET ${bucket} ANALYSIS ===\n\n`;

  // Show Previous Analysis Context
  if (previousAnalysis) {
    text += "=== PREVIOUS ANALYSIS (LAST TIME) ===\n";
    if (typeof previousAnalysis === "string") {
      text += previousAnalysis + "\n\n";
    } else {
      text += JSON.stringify(previousAnalysis, null, 2) + "\n\n";
    }
  }

  // Format Morning Plan
  if (morningPlan && morningPlan.data) {
    text += "=== TARGET GOALS ===\n";
    text += `Primary Goal: ${morningPlan.data.primary_goal || "Not set"}\n`;
    text += `Secondary Goal: ${morningPlan.data.secondary_goal || "Not set"}\n\n`;
  }

  // Format Device Usage (Phone, Extension, Laptop)
  if (usageRows && usageRows.length > 0) {
    text += "=== DEVICE ACTIVITY IN THIS BUCKET ===\n";
    usageRows.forEach(row => {
      text += `\n[${row.source}]\n`;
      if (typeof row.data === "object" && row.data !== null) {
        Object.entries(row.data).forEach(([key, value]) => {
          text += `  ${key}: ${value}\n`;
        });
      } else {
        text += `  Data: ${row.data}\n`;
      }
    });
  }

  // Format Fitband Data for this bucket only
  if (fitbandBucket) {
    text += "\n=== FITBAND HEALTH & ACTIVITY (THIS BUCKET) ===\n";
    text += `Active Minutes: ${fitbandBucket.active_minutes || 0}\n`;
    text += `Sedentary Minutes: ${fitbandBucket.sedentary_minutes || 0}\n`;
    text += `Dominant Activity: ${fitbandBucket.dominant_activity || "Unknown"}\n`;
    text += `Health State: ${fitbandBucket.health_state || "Unknown"}\n`;
    text += `Activity Breakdown - Sleep: ${fitbandBucket.time_sleep || 0}m, Sit: ${fitbandBucket.time_sit || 0}m, Stand: ${fitbandBucket.time_stand || 0}m, Walk: ${fitbandBucket.time_walk || 0}m, Run: ${fitbandBucket.time_run || 0}m\n`;
    text += `Standing Minutes: ${fitbandBucket.standing_minutes || 0}\n`;
    if (fitbandBucket.posture_stability) {
      text += `Posture Stability: ${fitbandBucket.posture_stability}\n`;
    }
    if (fitbandBucket.posture_changes) {
      text += `Last Position Changes: ${fitbandBucket.posture_changes}\n`;
    }
    if (fitbandBucket.suggested_task) {
      text += `Suggested Task: ${fitbandBucket.suggested_task}\n`;
    }
    if (fitbandBucket.health_insights) {
      text += `Health Insights: ${fitbandBucket.health_insights}\n`;
    }
  }

  return text;
}

// ================= FETCH PREVIOUS ANALYSIS =================

async function fetchPreviousAnalysis(bucket) {

  console.log("📜 Fetching previous analysis for bucket:", bucket);

  try {
    const query = `
      SELECT full_response, created_at
      FROM gemini_analysis_logs
      WHERE bucket_index = $1
      ORDER BY created_at DESC
      LIMIT 1
      OFFSET 1
    `;

    const { rows } = await pool.query(query, [bucket]);

    if (rows.length > 0) {
      console.log("✅ Previous analysis found");
      return rows[0].full_response;
    }

    console.log("⚠️ No previous analysis found");
    return null;

  } catch (err) {
    console.log("⚠️ Previous analysis fetch failed:", err.message);
    return null;
  }
}

// ================= FETCH FITBAND DATA =================

async function fetchFitbandBucketData(targetDate) {

  console.log("📥 Fetching fitband bucket data...");

  const query = `
SELECT
  bucket,
  active_minutes,
  sedentary_minutes,
  dominant_activity,
  suggested_task,
  health_state,
  posture_changes,
  posture_stability,
  health_insights,
  time_sleep,
  time_sit,
  time_stand,
  time_walk,
  time_run,
  standing_minutes,
  created_at
FROM fitband_bucket_insights
WHERE created_at::date = $1
ORDER BY bucket ASC
`;

  try {
    const { rows } = await pool.query(query, [targetDate]);
    console.log("✅ Fitband buckets fetched:", rows.length);
    return rows;
  } catch (err) {
    console.log("⚠️ Fitband data fetch failed:", err.message);
    return [];
  }
}

// ================= FETCH LATEST MORNING PLAN FALLBACK =================

async function fetchLatestMorningPlanUpTo(targetDate) {

  console.log("📥 Fetching latest morning plan up to:", targetDate);

  const query = `
    SELECT primary_goal, secondary_goal, created_at
    FROM morning_plans
    WHERE created_at::date <= $1
    ORDER BY created_at DESC
    LIMIT 1
  `;

  try {
    const { rows } = await pool.query(query, [targetDate]);
    if (rows.length > 0) {
      console.log("✅ Fallback morning plan found from:", rows[0].created_at);
      return { data: { primary_goal: rows[0].primary_goal, secondary_goal: rows[0].secondary_goal }, created_at: rows[0].created_at };
    }
    console.log("⚠️ No fallback morning plan available");
    return null;
  } catch (err) {
    console.log("⚠️ Fallback morning plan fetch failed:", err.message);
    return null;
  }

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

async function getAnalysisFromAI(bucket, morningPlan, usageRows, fitbandBucket, previousAnalysis) {

  console.log("🤖 Sending data to Ollama...");
  console.log("Bucket:", bucket);
  console.log("Morning plan:", JSON.stringify(morningPlan.data));
  console.log("Usage rows:", JSON.stringify(usageRows));
  console.log("Fitband bucket:", fitbandBucket ? fitbandBucket.bucket : "none");
  console.log("Previous analysis available:", !!previousAnalysis);

  const formattedData = formatDataAsText(bucket, morningPlan, usageRows, fitbandBucket, previousAnalysis);

  const systemPrompt = previousAnalysis 
    ? `You are a STRICT and HARSH productivity auditor. The user has a PREVIOUS ANALYSIS from last time. 
    
YOUR TASK:
1. First, determine if the user FOLLOWED the recommendations from the previous analysis
2. If YES (followed): Praise them and provide the NEXT LEVEL recommendations for improvement
3. If NO (ignored): Be EXTREMELY HARSH, use strong critical words, and emphasize how they FAILED to follow instructions

Your criticism should be DIRECT, BLUNT, and UNFORGIVING if they didn't follow advice.
Use phrases like:
- "You completely ignored..."
- "Unacceptable performance..."
- "You failed to..."
- "This is a serious lack of discipline..."
- "You're not taking this seriously..."

Your analysis should make them feel the urgency and importance of following recommendations.`
    : `You are a strict productivity and health auditor. Analyze the user's goals, device activity, and health metrics for this specific time bucket.`;

  const response = await axios.post(CONFIG.OLLAMA_URL, {
    model: CONFIG.MODEL_NAME,
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `Please analyze this data and provide a detailed productivity and health audit for this specific 15-minute bucket:\n\n${formattedData}\n\nReturn your analysis as JSON with these exact fields:
{
  "followed_previous_advice": true/false,
  "goal_adherence": {
    "summary": "how well goals were followed",
    "adherence_percentage": number
  },
  "activity_breakdown": {
    "aligned_activities": ["activity1", "activity2"],
    "misaligned_activities": ["activity1", "activity2"]
  },
  "health_posture_concerns": {
    "posture_status": "good/warning/critical",
    "concerns": ["concern1", "concern2"]
  },
  "motion_movement_patterns": {
    "activity_level": "sedentary/light/moderate/active",
    "position_changes": number
  },
  "recommendations": {
    "immediate": "what to do right now",
    "short_term": "next steps",
    "health": "health recommendation"
  }
}`
      }
    ],
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

    console.log("➡️ Step 1b: Fetching fitband data");

    const allFitbandData = await fetchFitbandBucketData(targetDate);

    console.log("➡️ Step 1c: Fetching previous analysis");

    const previousAnalysis = await fetchPreviousAnalysis(queryBucket);

    console.log("➡️ Step 2: Separating plan + usage + bucket data");

    let morningPlan = rows.find(r => r.source_type === "MORNING_PLAN");

    const usageRows = rows
      .filter(r => r.source_type !== "MORNING_PLAN")
      .filter(r => r.data && Object.keys(r.data).length > 0)
      .map(r => ({ source: r.source_type, data: r.data }));

    // Get fitband data for current bucket only
    const fitbandBucket = allFitbandData.find(b => b.bucket === queryBucket);

    console.log("Morning plan found:", !!morningPlan);
    console.log("Usage rows count:", usageRows.length);
    console.log("Fitband bucket found:", !!fitbandBucket);
    console.log("Previous analysis found:", !!previousAnalysis);

    let usedFallbackMorning = false;

    if (!morningPlan) {
      console.log("⚠️ No morning plan for target date — attempting fallback to latest available plan up to target date");
      const fallback = await fetchLatestMorningPlanUpTo(targetDate);
      if (fallback) {
        morningPlan = fallback;
        usedFallbackMorning = true;
        console.log("➡️ Using fallback morning plan (treated as today's plan) from:", fallback.created_at);
      } else {
        console.log("⏭️ No morning plan available even as fallback — stopping");
        return;
      }
    }

    console.log("➡️ Step 3: Calling Ollama");

    let rawResponse;

    try {

      rawResponse = await getAnalysisFromAI(queryBucket, morningPlan, usageRows, fitbandBucket, previousAnalysis);

    } catch (err) {

      console.error("❌ AI CALL FAILED:", err.message);

      rawResponse = {
        goal_adherence: { summary: "AI Analysis Failed", adherence_percentage: 0 },
        activity_breakdown: { aligned_activities: [], misaligned_activities: [] },
        health_posture_concerns: { posture_status: "unknown", concerns: [] },
        motion_movement_patterns: { activity_level: "unknown", position_changes: 0 },
        recommendations: { immediate: null, short_term: null, health: null }
      };
    }

    console.log("➡️ Step 4: Extracting AI insights");

    // Map AI response to database fields
    const goalAdherence = rawResponse.goal_adherence || {};
    const activityBreakdown = rawResponse.activity_breakdown || {};
    const healthConcerns = rawResponse.health_posture_concerns || {};
    const motionData = rawResponse.motion_movement_patterns || {};
    const recommendations = rawResponse.recommendations || {};
    const followedAdvice = rawResponse.followed_previous_advice ?? false;

    const aiAnalysis = {
      bad_review: goalAdherence.summary || null,
      suggestion: recommendations.immediate || null,
      guidance: recommendations.short_term || null,
      remark: `Bucket ${queryBucket} - Adherence: ${goalAdherence.adherence_percentage || 0}% | Followed Last Advice: ${followedAdvice ? "YES ✅" : "NO ❌"}`,
      problem: healthConcerns.concerns ? healthConcerns.concerns.join("; ") : null,
      followed_previous_advice: followedAdvice,
      motion: motionData.activity_level ? `Activity: ${motionData.activity_level}, Position changes: ${motionData.position_changes || 0}` : null,
      health: recommendations.health || null,
      roadmap: activityBreakdown.aligned_activities ? `Aligned: ${activityBreakdown.aligned_activities.join(", ")}` : null,
      topics_to_address: (activityBreakdown.misaligned_activities || []).concat(healthConcerns.concerns || [])
    };

    console.log("➡️ Step 5: Preparing DB insert");

      if (usedFallbackMorning) {
        aiAnalysis.remark = (aiAnalysis.remark || '') + ` | Fallback morning plan used from ${morningPlan.created_at}`;
      }

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
      JSON.stringify(rawResponse)
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
