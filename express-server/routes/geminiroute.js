require('dotenv').config();
const express = require("express");
const router = express.Router();
const pool = require("../db"); // Import pool to fetch logs
const { runAutomatedAnalysis } = require("../controllers/geminicontroller");

// --- 1. TRIGGER ANALYSIS (Manual Test) ---
// Your existing route to manually run the AI audit
router.get("/", runAutomatedAnalysis);

// --- 2. READ ALL ANALYSIS LOGS ---
// New route to read the JSON results stored in the DB
router.get("/logs", async (req, res) => {
    try {
        // Fetch the latest 50 analysis records
        const result = await pool.query(`
            SELECT 
                id, 
                activity_date, 
                bucket_index, 
                bad_review, 
                suggestion, 
                guidance, 
                remark, 
                problem, 
                motion,
                health,
                roadmap,
                topics_to_address,
                full_response,
                followed_previous_advice,
                created_at
            FROM gemini_analysis_logs 
            ORDER BY created_at DESC 
            LIMIT 50
        `);

        res.json({
            ok: true,
            count: result.rows.length,
            logs: result.rows
        });
    } catch (err) {
        console.error("❌ Error fetching AI logs:", err.message);
        res.status(500).json({ ok: false, error: "Could not retrieve analysis logs" });
    }
});

// --- 3. READ ANALYSIS FOR A SPECIFIC DATE ---
router.get("/logs/:date", async (req, res) => {
    const { date } = req.params; // Format: YYYY-MM-DD
    try {
        const result = await pool.query(`
            SELECT * FROM gemini_analysis_logs 
            WHERE activity_date = $1 
            ORDER BY bucket_index ASC
        `, [date]);

        res.json({ ok: true, date, logs: result.rows });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;