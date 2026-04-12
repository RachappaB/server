/**
 * controllers/dopamine.controller.js
 *
 * Analyzes a device's recent usage bucket data to detect dopamine loop patterns
 * and optionally sends a goal-rerouting notification.
 *
 * Routes (under /api/admin/dopamine, protected by adminAuth):
 *
 *   POST /api/admin/dopamine/check
 *       Body: { device_id, goal?, notify: bool, window_hours? }
 *       → Returns loop_detected, loop_score, top_apps, recommendation
 *       → If notify=true and loop detected → sends GOAL_REROUTE FCM
 *
 *   POST /api/admin/dopamine/goal
 *       Body: { device_id, goal }
 *       → Upserts the device's daily goal (stored in device_goals table)
 *
 *   GET  /api/admin/dopamine/goal/:device_id
 *       → Returns the stored goal for a device
 *
 * ─── Loop Detection Algorithm ─────────────────────────────────────────────
 *
 * We look at the last N hours of 15-minute buckets and compute a 0-100 score:
 *
 *   SIGNAL 1 — Unlock velocity (40 pts max)
 *     High unlocks-per-hour in recent buckets indicates compulsive checking.
 *     Score scales linearly from 0 → 40 as unlocks/hr goes from 0 → 30.
 *
 *   SIGNAL 2 — Notification-driven unlock ratio (35 pts max)
 *     If an app has a high ratio of unlock_triggers / total_notifications,
 *     the user is unlocking specifically because of that app's pings.
 *     Top app ratio > 0.5 → full 35 pts; scales linearly below.
 *
 *   SIGNAL 3 — App concentration (25 pts max)
 *     If the user's active time is concentrated in 1-2 apps (Gini-like metric),
 *     that's a loop signal. 100% in one app → 25 pts; spread → 0 pts.
 *
 * Thresholds:
 *   score < 40  → no loop detected
 *   score 40-69 → mild loop  (notify if requested)
 *   score 70+   → strong loop (notify always if notify=true)
 */

const pool           = require("../db");
const { randomUUID } = require("crypto");
const {
  sendGoalReroute,
  sendQuestionToDevice,
} = require("../fcm");

const LOOP_THRESHOLD_MILD   = 40;
const LOOP_THRESHOLD_STRONG = 70;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/dopamine/check
// ─────────────────────────────────────────────────────────────────────────────
async function checkDopamineLoop(req, res) {
  const {
    device_id,
    goal,               // override stored goal; if omitted, uses device_goals table
    notify    = false,  // send FCM if loop detected
    window_hours = 2,   // look-back window (1-6 hours)
  } = req.body;

  if (!device_id) {
    return res.status(400).json({ ok: false, error: "device_id is required" });
  }

  const hoursBack = Math.min(Math.max(Number(window_hours) || 2, 1), 6);

  try {
    // ── Fetch recent buckets ──────────────────────────────────────────────────
    // Each 15-min bucket has: unlocks (int), notif_by_app (jsonb), unlock_triggers (jsonb),
    // apps (jsonb with seconds_in_foreground per package)
    const bucketsPerHour = 60 / 15;
    const bucketCount    = Math.ceil(hoursBack * bucketsPerHour);

    const bucketResult = await pool.query(
      `
      SELECT
        ub.unlocks,
        ub.notifications,
        ub.notif_by_app,
        ub.unlock_triggers,
        ub.apps
      FROM usage_days_v2 ud
      JOIN usage_buckets_v2 ub ON ub.day_id = ud.id
      WHERE ud.device_id = $1
        AND ud.usage_date >= CURRENT_DATE - INTERVAL '1 day'
      ORDER BY ud.usage_date DESC, ub.bucket_index DESC
      LIMIT $2
      `,
      [device_id, bucketCount]
    );

    if (bucketResult.rowCount === 0) {
      return res.json({
        ok:             true,
        device_id,
        loop_detected:  false,
        loop_score:     0,
        reason:         "No recent bucket data available",
        window_hours:   hoursBack,
      });
    }

    const rows = bucketResult.rows;

    // ── SIGNAL 1: Unlock velocity ─────────────────────────────────────────────
    const totalUnlocks   = rows.reduce((s, r) => s + (Number(r.unlocks) || 0), 0);
    const unlocksPerHour = totalUnlocks / hoursBack;
    const signal1        = Math.min((unlocksPerHour / 30) * 40, 40);

    // ── SIGNAL 2: Notification-driven unlock ratio ────────────────────────────
    // Aggregate notif_by_app and unlock_triggers across all buckets
    const notifByApp    = {};
    const triggerByApp  = {};

    for (const row of rows) {
      const nb = row.notif_by_app    || {};
      const ut = row.unlock_triggers || {};

      for (const [pkg, count] of Object.entries(nb)) {
        notifByApp[pkg]   = (notifByApp[pkg]   || 0) + (Number(count) || 0);
      }
      for (const [pkg, count] of Object.entries(ut)) {
        triggerByApp[pkg] = (triggerByApp[pkg] || 0) + (Number(count) || 0);
      }
    }

    // Find the app with the highest unlock-trigger ratio
    let topAppPkg    = "";
    let topAppRatio  = 0;
    let topAppNotifs = 0;
    let topAppTriggers = 0;

    for (const pkg of Object.keys(notifByApp)) {
      const notifs   = notifByApp[pkg]   || 0;
      const triggers = triggerByApp[pkg] || 0;
      if (notifs < 3) continue;   // ignore apps with too few data points

      const ratio = triggers / notifs;
      if (ratio > topAppRatio) {
        topAppRatio    = ratio;
        topAppPkg      = pkg;
        topAppNotifs   = notifs;
        topAppTriggers = triggers;
      }
    }

    const signal2 = Math.min(topAppRatio * 70, 35);   // 0.5 ratio → 35 pts

    // ── SIGNAL 3: App concentration (simplified Herfindahl index) ────────────
    // Sum time-in-foreground per app across all buckets
    const appTime = {};
    for (const row of rows) {
      const appsObj = row.apps || {};
      for (const [pkg, seconds] of Object.entries(appsObj)) {
        appTime[pkg] = (appTime[pkg] || 0) + (Number(seconds) || 0);
      }
    }

    const totalTime = Object.values(appTime).reduce((s, v) => s + v, 0);
    let hhi = 0;   // Herfindahl–Hirschman Index (0 = spread, 1 = all in one app)
    if (totalTime > 0) {
      for (const seconds of Object.values(appTime)) {
        const share = seconds / totalTime;
        hhi += share * share;
      }
    }

    const signal3 = hhi * 25;   // max 25 pts when all time in one app

    // ── Final score ───────────────────────────────────────────────────────────
    const loopScore     = Math.round(signal1 + signal2 + signal3);
    const loopDetected  = loopScore >= LOOP_THRESHOLD_MILD;
    const loopStrength  = loopScore >= LOOP_THRESHOLD_STRONG
      ? "strong"
      : loopScore >= LOOP_THRESHOLD_MILD
        ? "mild"
        : "none";

    // Top apps by usage time for the report
    const topApps = Object.entries(appTime)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([pkg, seconds]) => ({
        package:           pkg,
        seconds_active:    seconds,
        notifications:     notifByApp[pkg]   || 0,
        unlock_triggers:   triggerByApp[pkg] || 0,
      }));

    const analysis = {
      ok:            true,
      device_id,
      loop_detected: loopDetected,
      loop_score:    loopScore,
      loop_strength: loopStrength,
      window_hours:  hoursBack,
      buckets_analyzed: rows.length,
      signals: {
        unlock_velocity: {
          unlocks_in_window:   totalUnlocks,
          unlocks_per_hour:    Math.round(unlocksPerHour * 10) / 10,
          score_contribution:  Math.round(signal1),
        },
        notification_driven: {
          top_app:           topAppPkg,
          top_app_ratio:     Math.round(topAppRatio * 1000) / 1000,
          top_app_notifs:    topAppNotifs,
          top_app_triggers:  topAppTriggers,
          score_contribution: Math.round(signal2),
        },
        app_concentration: {
          hhi_index:          Math.round(hhi * 1000) / 1000,
          score_contribution: Math.round(signal3),
        },
      },
      top_apps: topApps,
    };

    // ── Notify if requested and loop detected ─────────────────────────────────
    let notificationSent   = false;
    let notificationResult = null;

    if (notify && loopDetected) {
      // Resolve goal: param → device_goals table → generic fallback
      let resolvedGoal = goal;
      if (!resolvedGoal) {
        const goalRow = await pool.query(
          `SELECT goal FROM device_goals WHERE device_id = $1`,
          [device_id]
        );
        resolvedGoal = goalRow.rows[0]?.goal || "your stated daily goal";
      }

      const tokenRow = await pool.query(
        `SELECT fcm_token FROM device_tokens WHERE device_id = $1`,
        [device_id]
      );

      if (tokenRow.rowCount > 0) {
        const token      = tokenRow.rows[0].fcm_token;
        const questionId = `q_loop_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

        // Persist as a question so the response can be tracked
        await pool.query(
          `INSERT INTO questions (question_id, device_id, message)
           VALUES ($1, $2, $3)`,
          [
            questionId,
            device_id,
            `Dopamine loop detected (score ${loopScore}). Goal: ${resolvedGoal} — back on track?`,
          ]
        );

        try {
          const fcmMsgId = await sendGoalReroute(
            token, questionId, resolvedGoal, topAppPkg, loopScore
          );
          await pool.query(
            `UPDATE questions SET fcm_msg_id = $1 WHERE question_id = $2`,
            [fcmMsgId, questionId]
          );

          notificationSent   = true;
          notificationResult = { question_id: questionId, fcm_msg_id: fcmMsgId };
          console.log(
            `✅ Goal-reroute sent to ${device_id}: score=${loopScore} top_app=${topAppPkg}`
          );
        } catch (fcmErr) {
          console.error("Goal-reroute FCM failed:", fcmErr);
          notificationResult = { error: fcmErr.message };
        }
      } else {
        notificationResult = { error: "No FCM token registered for this device" };
      }
    }

    return res.json({
      ...analysis,
      notification_sent:   notificationSent,
      notification_result: notificationResult,
    });

  } catch (err) {
    console.error("checkDopamineLoop error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/dopamine/goal
//
// Set or update a device's daily goal (used by the dopamine checker as context).
//
// Body: { device_id, goal }
// ─────────────────────────────────────────────────────────────────────────────
async function setGoal(req, res) {
  const { device_id, goal } = req.body;
  if (!device_id || !goal) {
    return res.status(400).json({ ok: false, error: "device_id and goal are required" });
  }

  try {
    await pool.query(
      `
      INSERT INTO device_goals (device_id, goal, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (device_id) DO UPDATE SET
        goal       = EXCLUDED.goal,
        updated_at = NOW()
      `,
      [device_id, goal]
    );
    console.log(`✅ Goal set for device=${device_id}: "${goal}"`);
    return res.json({ ok: true, device_id, goal });
  } catch (err) {
    console.error("setGoal error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/dopamine/goal/:device_id
// ─────────────────────────────────────────────────────────────────────────────
async function getGoal(req, res) {
  const { device_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT device_id, goal, updated_at FROM device_goals WHERE device_id = $1`,
      [device_id]
    );
    if (result.rowCount === 0) {
      return res.json({ ok: true, device_id, goal: null });
    }
    return res.json({ ok: true, ...result.rows[0] });
  } catch (err) {
    console.error("getGoal error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = {
  checkDopamineLoop,
  setGoal,
  getGoal,
};