# Testing Guide - Gemini Controller

## Test Endpoints

### 1. Trigger Analysis (Manual)
```bash
curl http://localhost:3000/api/gemini
```
**Response:** 
```json
{ "ok": true }
```

### 2. View All Analysis Logs
```bash
curl http://localhost:3000/api/gemini/logs
```
**Response:**
```json
{
  "ok": true,
  "count": 50,
  "logs": [
    {
      "id": 123,
      "activity_date": "2026-02-07",
      "bucket_index": 45,
      "bad_review": "...",
      "suggestion": "...",
      "guidance": "...",
      "remark": "...",
      "problem": "...",
      "motion": "...",
      "health": "...",
      "roadmap": "...",
      "topics_to_address": [...],
      "full_response": {...},
      "followed_previous_advice": false,
      "created_at": "2026-02-07T15:30:00Z"
    }
  ]
}
```

### 3. View Analysis for Specific Date
```bash
curl http://localhost:3000/api/gemini/logs/2026-02-07
```

---

## Expected Log Output During Analysis

### Step-by-Step Console Logs:

```
🚀 Starting automated analysis...
⏰ Calculating time context...
✅ Time context: { targetDate: '2026-02-07', queryBucket: 45 }

➡️ Step 1: Fetching DB context
📥 Fetching context data...
DATE: 2026-02-07 BUCKET: 45
📡 Running SQL query...
✅ Rows fetched: 4
📦 Raw rows: [...]

➡️ Step 1b: Fetching fitband data
📥 Fetching fitband bucket data...
✅ Fitband buckets fetched: 96

➡️ Step 2: Separating plan + usage + bucket data
Morning plan found: true
Usage rows count: 3
Fitband bucket found: true

➡️ Step 3: Calling Ollama
🤖 Sending data to Ollama...
Bucket: 45
Morning plan: {"primary_goal":"Focus on productivity","secondary_goal":"Complete project"}
Usage rows: [{"source":"PHONE","data":{...}},...]
Fitband bucket: {"bucket":45,"active_minutes":5,...}

✅ Ollama responded
📥 RAW AI RESPONSE:
{"productivity_score":8.5,"health_status":"good",...}

✅ AI JSON parsed normally

📊 Final AI object: {...}

➡️ Step 4: Preparing DB insert
📤 Insert values preview: [...]

➡️ Step 5: Writing to DB
✅ Analysis Saved Successfully

⏱️ Analysis Duration: 5234ms
```

---

## Data Structure Examples

### Formatted Text Sent to AI:

```
=== BUCKET 45 ANALYSIS ===

=== TARGET GOALS ===
Primary Goal: Focus on coding tasks
Secondary Goal: Exercise for 15 minutes

=== DEVICE ACTIVITY IN THIS BUCKET ===

[PHONE]
  WhatsApp: 2m
  Twitter: 1m
  Gmail: 30s

[EXTENSION]
  youtube.com: 3 visits
  github.com: 5 visits

[LAPTOP]
  VS Code: 12m
  Chrome: 2m

=== FITBAND HEALTH & ACTIVITY (THIS BUCKET) ===
Active Minutes: 5
Sedentary Minutes: 10
Dominant Activity: Walking
Health State: Good
Activity Breakdown - Sleep: 0m, Sit: 8m, Stand: 5m, Walk: 2m, Run: 0m
Standing Minutes: 5
Posture Stability: Good
Last Position Changes: 3
Suggested Task: Take a break
Health Insights: User walked 2 minutes in this bucket
```

### AI Response Format Expected:

```json
{
  "productivity_score": 8.5,
  "health_status": "good",
  "goal_alignment": "high",
  "bad_review": "Short WhatsApp distractions during coding",
  "suggestion": "Use app blockers during focused work",
  "guidance": "Continue current coding session, maintain standing position",
  "remark": "Good balance of work and movement",
  "problem": "Minor social media usage",
  "motion": "Good - 3 position changes showing activity",
  "health": "Excellent - 5 minutes of standing/walking",
  "roadmap": "Increase exercise to 20 minutes next bucket",
  "topics_to_address": ["focus management", "activity levels"],
  "followed_previous_advice": true
}
```

---

## Bucket Number Reference

| Bucket | Time Range | Start | End |
|--------|-----------|-------|-----|
| 0 | 00:00-00:15 | 12:00 AM | 12:15 AM |
| 1 | 00:15-00:30 | 12:15 AM | 12:30 AM |
| 4 | 01:00-01:15 | 1:00 AM | 1:15 AM |
| 32 | 08:00-08:15 | 8:00 AM | 8:15 AM |
| 45 | 11:15-11:30 | 11:15 AM | 11:30 AM |
| 60 | 15:00-15:15 | 3:00 PM | 3:15 PM |
| 95 | 23:45-00:00 | 11:45 PM | 12:00 AM |

**Formula:** `bucket = floor((hours * 60 + minutes) / 15)`

---

## Cron Job Setup

To enable automated analysis every 15 minutes, uncomment in server.js:

```javascript
cron.schedule('*/15 * * * *', async () => {
    console.log('⏰ Cron Triggered: Starting 15-minute Productivity Analysis...');
    try {
      const result = await runAutomatedAnalysis();
      console.log("✅ Cron Completed");
    } catch (err) {
      console.error('❌ Cron Job Failed:', err);
    }
});
```

---

## Troubleshooting

### Issue: "No morning plan — stopping"
**Cause:** No morning_plans record for today  
**Solution:** Add a morning plan before running analysis

### Issue: "Fitband bucket found: false"
**Cause:** No fitband data for this bucket  
**Solution:** Fitband data may not be available yet, will use null gracefully

### Issue: "JSON parse failed"
**Cause:** AI response not valid JSON  
**Solution:** Code attempts to fix JSON automatically, if all fails returns fallback object

### Issue: Database connection error
**Cause:** Pool connection issue  
**Solution:** Check database connection in db.js and ensure gemini_analysis_logs table exists

---

## Database Schema Required

```sql
CREATE TABLE gemini_analysis_logs (
  id SERIAL PRIMARY KEY,
  activity_date DATE NOT NULL,
  bucket_index INTEGER NOT NULL,
  morning_plan JSONB,
  sent_input_data JSONB,
  bad_review TEXT,
  suggestion TEXT,
  guidance TEXT,
  remark TEXT,
  problem TEXT,
  followed_previous_advice BOOLEAN DEFAULT false,
  motion TEXT,
  health TEXT,
  roadmap TEXT,
  topics_to_address JSONB,
  full_response JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Status Check

✅ Code syntax: VALID  
✅ All functions: IMPLEMENTED  
✅ Error handling: COMPLETE  
✅ Database integration: READY  
✅ Routes: CONFIGURED  

**Ready to test!**
