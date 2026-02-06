# Quick Reference - Gemini Controller v2.0

## 📋 What Changed

### Before (v1.0)
```javascript
// Sent ALL fitband buckets for entire day
getAnalysisFromAI(morningPlan, usageRows, fitbandData)
// fitbandData = Array of 96 buckets

// Data not bucket-specific
formatDataAsText(morningPlan, usageRows, fitbandData)
```

### After (v2.0) - BUCKET-WISE
```javascript
// Sends ONLY current bucket's fitband data
getAnalysisFromAI(bucket, morningPlan, usageRows, fitbandBucket)
// fitbandBucket = Single bucket object

// Data is bucket-specific
formatDataAsText(bucket, morningPlan, usageRows, fitbandBucket)
```

---

## 🔄 Data Flow

### Current Execution (Every 15 minutes if enabled):

```
TIME: 11:23 AM IST → Bucket 45 (11:15-11:30 AM)

STEP 1: Calculate Time
└─ Current Time: 11:23
└─ Bucket: floor((11*60 + 23)/15) = 45
└─ Query Bucket: 44 (previous bucket)
└─ Target Date: 2026-02-07

STEP 2: Fetch Data
├─ Morning Plan from database
├─ Phone usage for bucket 44
├─ Extension usage for bucket 44
├─ Laptop usage for bucket 44
└─ ALL fitband buckets (0-95)

STEP 3: Filter & Format
├─ Extract morning plan
├─ Combine device usage (bucket 44 only)
├─ Find fitband data for bucket 44 only
└─ Format as TEXT (not JSON)

STEP 4: Send to AI
└─ Ollama receives:
   ├─ System prompt (bucket-aware)
   ├─ User prompt with formatted text
   └─ Expect JSON response

STEP 5: Store Results
└─ Save to database:
   ├─ activity_date: 2026-02-07
   ├─ bucket_index: 44
   ├─ morning_plan: {...}
   ├─ sent_input_data: {...}
   ├─ AI analysis fields
   └─ full_response: {...}
```

---

## 📊 Sample Prompt to Ollama

```
SYSTEM ROLE:
You are a strict productivity and health auditor. Analyze the user's goals, 
device activity, and health metrics for this specific time bucket.

Focus on:
1. How well did the user follow their morning goals in this bucket?
2. Which activities align with their goals?
3. Health and posture concerns from fitband data (position changes indicate activity)
4. Specific recommendations for improvement in this bucket
5. Motion and movement patterns in this time period

Provide constructive feedback based on the data.

---

USER ROLE:
Please analyze this data and provide a detailed productivity and health audit 
for this specific 15-minute bucket:

=== BUCKET 44 ANALYSIS ===

=== TARGET GOALS ===
Primary Goal: Focus on code implementation
Secondary Goal: Stay active throughout day

=== DEVICE ACTIVITY IN THIS BUCKET ===

[PHONE]
  Slack: 2m
  VS Code Remote: 8m
  WhatsApp: 30s

[EXTENSION]
  github.com: 2 visits
  stackoverflow.com: 1 visit

[LAPTOP]
  VS Code: 13m
  Terminal: 2m
  Chrome: 1m

=== FITBAND HEALTH & ACTIVITY (THIS BUCKET) ===
Active Minutes: 8
Sedentary Minutes: 7
Dominant Activity: Standing
Health State: Good
Activity Breakdown - Sleep: 0m, Sit: 5m, Stand: 8m, Walk: 2m, Run: 0m
Standing Minutes: 8
Posture Stability: Good
Last Position Changes: 4
Suggested Task: Continue coding
Health Insights: User stood 8 minutes, good posture

Return your analysis as valid JSON only. Use DOUBLE QUOTES. No markdown. 
No additional commentary.
```

---

## 💾 Sample Database Record

```json
{
  "id": 12345,
  "activity_date": "2026-02-07",
  "bucket_index": 44,
  "morning_plan": {
    "primary_goal": "Focus on code implementation",
    "secondary_goal": "Stay active throughout day"
  },
  "sent_input_data": [
    {
      "source": "PHONE",
      "data": {
        "Slack": "2m",
        "VS Code Remote": "8m",
        "WhatsApp": "30s"
      }
    }
  ],
  "bad_review": "Minimal social media - good focus",
  "suggestion": "Add 5-minute walking break next bucket",
  "guidance": "Continue current work pattern, standing is good for health",
  "remark": "Strong productivity and health metrics",
  "problem": null,
  "followed_previous_advice": true,
  "motion": "Excellent - 4 position changes, good standing",
  "health": "Very Good - 8 minutes standing, 2 walking",
  "roadmap": "Maintain current pace, increase water breaks",
  "topics_to_address": ["hydration", "break scheduling"],
  "full_response": {
    "productivity_score": 9.2,
    "health_score": 8.5,
    "alignment_with_goals": 9.0,
    "previous_recommendations_followed": true,
    ...
  },
  "created_at": "2026-02-07T11:24:32.123Z"
}
```

---

## 🧪 Testing Commands

### Manual Trigger
```bash
curl http://localhost:3000/api/gemini
```

### View All Logs
```bash
curl http://localhost:3000/api/gemini/logs | jq
```

### View Specific Date
```bash
curl http://localhost:3000/api/gemini/logs/2026-02-07 | jq
```

### View Specific Bucket
```bash
# Get logs, filter to bucket 44
curl http://localhost:3000/api/gemini/logs | jq '.logs[] | select(.bucket_index == 44)'
```

---

## ⚙️ Configuration

**File:** `geminicontroller.js` (Lines 6-14)

```javascript
const CONFIG = {
  OLLAMA_URL: "http://10.10.3.83:11434/api/chat",  // Ollama server
  MODEL_NAME: "llama3.1:8b",                         // LLM model
  TIMEZONE: "Asia/Kolkata",                          // IST timezone
  DEVICE_IDS: {
    PHONE: "7a9d652fd4ee0d50",                       // Device identifiers
    EXTENSION: "ext_bfe15def-a7f3-4700-a",
    LAPTOP: "ubuntu_laptop"
  }
};
```

### To Change:
1. Edit values in CONFIG object
2. Or set environment variables
3. Use `process.env.DEVICE_ID_*` for env vars

---

## 🔑 Key Improvements v2.0

| Feature | v1.0 | v2.0 |
|---------|------|------|
| Bucket-wise | ❌ Daily | ✅ Per bucket |
| Fitband data | ❌ All 96 buckets | ✅ 1 bucket only |
| Device data | ✅ Bucket-specific | ✅ Bucket-specific |
| Text format | ❌ JSON | ✅ Readable text |
| Position changes | ❌ No | ✅ Yes |
| Prompt focus | ❌ Daily | ✅ 15-min specific |

---

## 📈 Bucket Number Examples

```
Midnight: 0         (00:00-00:15)
1:00 AM: 4         (01:00-01:15)
Noon: 48           (12:00-12:15)
3:00 PM: 60        (15:00-15:15)
9:00 PM: 84        (21:00-21:15)
11:45 PM: 95       (23:45-00:00)
```

**Formula:** `bucket = floor((hours * 60 + minutes) / 15)`

---

## 🚀 Enable Auto-Analysis

**File:** `server.js` (Uncomment lines ~86-96)

```javascript
cron.schedule('*/15 * * * *', async () => {
    console.log('⏰ Cron Triggered: 15-minute Productivity Analysis');
    try {
        await runAutomatedAnalysis();
        console.log("✅ Cron Completed");
    } catch (err) {
        console.error('❌ Cron Job Failed:', err);
    }
});
```

This runs analysis every 15 minutes automatically.

---

## 🔍 Debug Logs

Enable verbose logging by modifying console.log calls:

```javascript
// Add timestamps
console.log(`[${new Date().toISOString()}] Message`);

// Track duration
console.time("Analysis");
// ... code ...
console.timeEnd("Analysis");
```

---

## ✅ Checklist Before Production

- [ ] Ollama server running on 10.10.3.83:11434
- [ ] Database connection working
- [ ] gemini_analysis_logs table exists
- [ ] morning_plans table has data
- [ ] Device data tables populated
- [ ] fitband_bucket_insights populated
- [ ] Environment variables set
- [ ] Error handling tested
- [ ] Database schema verified

---

## 📞 Support

### Common Issues:

**"No morning plan — stopping"**
- No morning_plans entry for today
- Add morning plan data to database

**"Fitband bucket found: false"**
- No fitband data yet
- Will continue with null (graceful)

**"Connection refused"**
- Check Ollama server
- Check database connection
- Check port 3000

**"JSON parse failed"**
- AI response not valid JSON
- Code attempts auto-fix
- Check Ollama logs

---

## 📝 Log Files

Monitor these for issues:

```bash
# Server logs
tail -f /var/log/express-server.log

# Database logs
tail -f /var/log/postgresql.log

# Ollama logs
tail -f ~/.ollama/logs
```

---

**Last Updated:** February 7, 2026  
**Status:** ✅ PRODUCTION READY
