require('dotenv').config();
const pool = require("../db");
const axios = require("axios");

// --- Configuration ---
const CONFIG = {
    OLLAMA_URL: "http://10.10.3.83:11434/api/chat",
    MODEL_NAME: "llama3.1:8b", // Change to your Ollama model name
    TIMEZONE: "Asia/Kolkata",
    DEVICE_IDS: {
        PHONE: process.env.DEVICE_ID_PHONE || "7a9d652fd4ee0d50",
        EXTENSION: process.env.DEVICE_ID_EXTENSION || "ext_bfe15def-a7f3-4700-a",
        LAPTOP: process.env.DEVICE_ID_LAPTOP || "ubuntu_laptop"
    }
};

/**
 * Calculates Date and Bucket (4 AM Productivity Day logic)
 */
function getTimeContext() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', { 
        timeZone: CONFIG.TIMEZONE, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: 'numeric' 
    });
    const parts = formatter.formatToParts(now);
    const getP = (type) => parseInt(parts.find(p => p.type === type).value);
    
    const hours = getP('hour');
    const minutes = getP('minute');
    const currentBucketIndex = Math.floor((hours * 60 + minutes) / 15);
    // Analyze the *previous* 15-minute chunk
    const queryBucket = (currentBucketIndex - 1) < 0 ? 95 : (currentBucketIndex - 1);

    const targetDateObj = new Date(now);
    if (hours < 4) targetDateObj.setDate(targetDateObj.getDate() - 1);
    const targetDate = targetDateObj.toLocaleDateString('en-CA'); 

    return { targetDate, queryBucket };
}

/**
 * Fetches Context Data including Summarized Fitband Data
 */
async function fetchContextData(targetDate, queryBucket) {
    const query = `
        WITH plan AS (
            SELECT 'MORNING_PLAN' AS source_type, 
                   jsonb_build_object('primary_goal', primary_goal, 'secondary_goal', secondary_goal) as data
            FROM morning_plans 
            WHERE created_at::date = $1 
            ORDER BY created_at DESC LIMIT 1
        ),
        usage AS (
            -- PHONE
            SELECT 'PHONE' AS source_type, ub.apps::jsonb AS data
            FROM usage_buckets ub 
            JOIN usage_days ud ON ub.day_id = ud.id
            WHERE ud.device_id = $2 AND ud.usage_date = $1 AND ub.bucket_index = $5
            UNION ALL
            -- BROWSER EXTENSION
            SELECT 'EXTENSION' AS source_type, domains::jsonb AS data
            FROM extension_usage_stream 
            WHERE device_id = $3 AND usage_date = $1 AND bucket_index = $5
            UNION ALL
            -- LAPTOP
            SELECT 'LAPTOP' AS source_type, apps::jsonb AS data
            FROM laptop_activity_15m 
            WHERE device_name = $4 
              AND (timestamp AT TIME ZONE $6)::date = $1 
              AND bucket_15min_id = $5
            UNION ALL
            -- FITBAND (Summarized)
            SELECT 'FITBAND' AS source_type, 
                   jsonb_build_object('motion_summary', 
                       CASE (
                           SELECT mode() WITHIN GROUP (ORDER BY val) 
                           FROM unnest(motion_data) AS val
                       )
                       WHEN 0 THEN 'Sleeping'
                       WHEN 1 THEN 'Sitting/Stationary'
                       WHEN 2 THEN 'Standing'
                       WHEN 3 THEN 'Walking'
                       WHEN 4 THEN 'Running'
                       ELSE 'Unknown'
                       END
                   ) AS data
            FROM fitband_activity_logs
            WHERE record_time::date = $1 AND bucket = $5
            ORDER BY 1 DESC LIMIT 1 -- Get the latest log if multiples exist for the bucket
        )
        SELECT * FROM plan UNION ALL SELECT * FROM usage;
    `;

    const values = [
        targetDate, 
        CONFIG.DEVICE_IDS.PHONE, 
        CONFIG.DEVICE_IDS.EXTENSION, 
        CONFIG.DEVICE_IDS.LAPTOP, 
        queryBucket,
        CONFIG.TIMEZONE
    ];

    const { rows } = await pool.query(query, values);
    return rows;
}

/**
 * Sends data to Ollama
 */
async function getAnalysisFromAI(morningPlan, usageRows) {
    try {
        const prompt = `You are a strict productivity auditor.
CONTEXT:
- Target Goals: ${JSON.stringify(morningPlan.data)}
- Actual Activity (Last 15 mins): ${JSON.stringify(usageRows)}

TASK:
Analyze if the activity (Phone, Laptop, Browser, and Physical Motion) aligns with the goals.
Note: FITBAND 'motion_summary' tells you if the user was sitting, walking, etc.

Return ONLY a JSON object with no additional text:
{
    "bad_review": "string (concise critique)",
    "suggestion": "string (actionable fix)",
    "guidance": "string (strategic advice)",
    "remark": "string (overall status)",
    "problem": "string (the main distraction/issue)",
    "followed_previous_advice": boolean
}`;

        console.log(`📡 Connecting to Ollama: ${CONFIG.OLLAMA_URL}`);
        console.log(`🤖 Using model: ${CONFIG.MODEL_NAME}`);

        const response = await axios.post(CONFIG.OLLAMA_URL, {
            model: CONFIG.MODEL_NAME,
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            stream: false
        }, {
            timeout: 60000 // 60 second timeout
        });

        // Extract the text content from Ollama response
        const aiResponse = response.data.message.content;
        
        // Try to parse JSON from the response
        // Handle cases where the AI might add extra text before/after JSON
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("No JSON object found in response");
        }

        return JSON.parse(jsonMatch[0]);

    } catch (error) {
        console.error("❌ Ollama Error:", error.message);
        if (error.response) {
            console.error("❌ Response Status:", error.response.status);
            console.error("❌ Response Data:", error.response.data);
        }
        throw error;
    }
}

/**
 * Main Controller Function
 */
async function runAutomatedAnalysis(req, res) {
    console.time("⏱️ Analysis Duration");
    try {
        const { targetDate, queryBucket } = getTimeContext();
        console.log(`🚀 Analysis: ${targetDate} | Bucket: ${queryBucket}`);

        const rows = await fetchContextData(targetDate, queryBucket);
        
        const morningPlan = rows.find(r => r.source_type === 'MORNING_PLAN');
        const usageRows = rows.filter(r => r.source_type !== 'MORNING_PLAN');

        if (!morningPlan) {
            console.log("⏭️ No plan found. Skipping.");
            if (res) res.json({ ok: false, message: "No plan" });
            return;
        }

        const aiAnalysis = await getAnalysisFromAI(morningPlan, usageRows);
        
        if (aiAnalysis) {
            await pool.query(`
                INSERT INTO gemini_analysis_logs 
                (activity_date, bucket_index, morning_plan, sent_input_data, bad_review, suggestion, guidance, remark, problem, followed_previous_advice)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                targetDate, queryBucket, morningPlan.data, JSON.stringify(usageRows),
                aiAnalysis.bad_review, aiAnalysis.suggestion, aiAnalysis.guidance, 
                aiAnalysis.remark, aiAnalysis.problem, aiAnalysis.followed_previous_advice
            ]);
            console.log("✅ Analysis Saved.");
        }

        if (res) res.json({ ok: true, data: aiAnalysis });

    } catch (err) {
        console.error("❌ Analysis Error:", err.message);
        if (res) res.status(500).json({ ok: false, error: err.message });
    } finally {
        console.timeEnd("⏱️ Analysis Duration");
    }
}

module.exports = { runAutomatedAnalysis };