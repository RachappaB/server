/**
 * notificationEngine.js
 * Written against the ACTUAL verified DB schema (pg_dump confirmed).
 *
 * Schema used:
 *   campaign_sends  : id, run_id, run_number, campaign_id, device_id,
 *                     send_key, prompt_snapshot, hint_snapshot,
 *                     sent_at, fcm_msg_id, fcm_error
 *   campaign_runs   : id, campaign_id, run_number, triggered_by,
 *                     message_index, prompt_snapshot, audience_size,
 *                     sent_count, failed_count, skipped_count,
 *                     status, started_at, finished_at
 *   campaigns       : id, name, description, audience_id, template_id,
 *                     schedule_type, cron_expr, message_cursor, run_count,
 *                     offline_timeout_ms, send_dedup_hours, priority,
 *                     status, starts_at, ends_at, created_at, updated_at, last_run_at
 *   audiences       : id, name, description, type, config, created_at, updated_at
 *   message_templates: id, name, description, notification_type, strategy,
 *                     messages, created_at, updated_at
 *   device_groups   : device_id, group_name, added_by, added_at
 *   device_metadata : device_id, display_name, tags, first_seen, last_active, notes
 *   device_tokens   : id, device_id, fcm_token, platform, registered_at, updated_at
 */

const nodeCron    = require("node-cron");
const pool        = require("./db");
const { randomUUID } = require("crypto");
const cronParser  = require("cron-parser");
const {
  sendBroadcast, sendSimple, sendQuestion, sendInputRequest,
  getCachedToken, cacheToken, invalidateToken, isTokenInvalid,
} = require("./fcm");

const IST_TZ = "Asia/Kolkata";

// ── Segment SQL ───────────────────────────────────────────────────────────
const SEGMENTS = {
  active_7d: `SELECT DISTINCT dt.device_id,dt.fcm_token FROM device_tokens dt JOIN usage_days_v2 ud ON ud.device_id=dt.device_id WHERE ud.usage_date>=CURRENT_DATE-INTERVAL '7 days'`,
  active_14d: `SELECT DISTINCT dt.device_id,dt.fcm_token FROM device_tokens dt JOIN usage_days_v2 ud ON ud.device_id=dt.device_id WHERE ud.usage_date>=CURRENT_DATE-INTERVAL '14 days'`,
  inactive_14d: `SELECT dt.device_id,dt.fcm_token FROM device_tokens dt WHERE dt.device_id NOT IN(SELECT DISTINCT device_id FROM usage_days_v2 WHERE usage_date>=CURRENT_DATE-INTERVAL '14 days')`,
  inactive_30d: `SELECT dt.device_id,dt.fcm_token FROM device_tokens dt WHERE dt.device_id NOT IN(SELECT DISTINCT device_id FROM usage_days_v2 WHERE usage_date>=CURRENT_DATE-INTERVAL '30 days')`,
  never_responded: `SELECT dt.device_id,dt.fcm_token FROM device_tokens dt WHERE dt.device_id NOT IN(SELECT DISTINCT device_id FROM campaign_responses)`,
  responded_today: `SELECT DISTINCT dt.device_id,dt.fcm_token FROM device_tokens dt JOIN campaign_responses cr ON cr.device_id=dt.device_id WHERE cr.received_at AT TIME ZONE 'Asia/Kolkata'>=CURRENT_DATE`,
  no_response_7d: `SELECT dt.device_id,dt.fcm_token FROM device_tokens dt WHERE dt.device_id NOT IN(SELECT DISTINCT device_id FROM campaign_responses WHERE received_at>=NOW()-INTERVAL '7 days')`,
};
module.exports.SEGMENTS = SEGMENTS;

// ── Audience resolver ─────────────────────────────────────────────────────
async function resolveAudience(audience) {
  const { type, config = {} } = audience;
  if (type === "all") return (await pool.query(`SELECT device_id,fcm_token FROM device_tokens ORDER BY device_id`)).rows;
  if (type === "device") {
    if (!config.device_id) return [];
    return (await pool.query(`SELECT device_id,fcm_token FROM device_tokens WHERE device_id=$1`,[config.device_id])).rows;
  }
  if (type === "group") {
    if (!config.group_name) return [];
    return (await pool.query(`SELECT dt.device_id,dt.fcm_token FROM device_tokens dt JOIN device_groups dg ON dg.device_id=dt.device_id WHERE dg.group_name=$1 ORDER BY dt.device_id`,[config.group_name])).rows;
  }
  if (type === "segment") {
    const filter = config.filter || "";
    if (filter.startsWith("custom_tag:")) {
      const [,key,val] = filter.split(":");
      if (!key||!val) return [];
      return (await pool.query(`SELECT dt.device_id,dt.fcm_token FROM device_tokens dt JOIN device_metadata dm ON dm.device_id=dt.device_id WHERE dm.tags->>$1=$2`,[key,val])).rows;
    }
    const sql = SEGMENTS[filter];
    if (!sql) { console.warn(`[Engine] Unknown segment: "${filter}"`); return []; }
    return (await pool.query(sql)).rows;
  }
  return [];
}
module.exports.resolveAudience = resolveAudience;

// ── Message picker ────────────────────────────────────────────────────────
function pickMessage(strategy, messages, cursor) {
  const msgs = Array.isArray(messages) ? messages : [];
  if (!msgs.length) throw new Error("Template has no messages");
  switch (strategy) {
    case "static":     return { message:msgs[0],             nextCursor:0,          exhausted:false };
    case "rotating":   return { message:msgs[cursor%msgs.length], nextCursor:(cursor+1)%msgs.length, exhausted:false };
    case "sequential": return { message:msgs[Math.min(cursor,msgs.length-1)], nextCursor:cursor+1, exhausted:cursor+1>=msgs.length };
    case "random":     return { message:msgs[Math.floor(Math.random()*msgs.length)], nextCursor:cursor, exhausted:false };
    default:           return { message:msgs[0], nextCursor:0, exhausted:false };
  }
}

// ── Offline timeout (TYPE 3) ──────────────────────────────────────────────
const _timers = new Map();
function armOfflineTimeout(sendKey, deviceId, campaignId, ms) {
  clearOfflineTimeout(sendKey);
  const h = setTimeout(async () => {
    _timers.delete(sendKey);
    try {
      const ex = await pool.query(`SELECT send_key FROM campaign_responses WHERE send_key=$1`,[sendKey]);
      if (!ex.rowCount)
        await pool.query(`INSERT INTO campaign_responses(send_key,campaign_id,device_id,response) VALUES($1,$2,$3,'offline') ON CONFLICT DO NOTHING`,[sendKey,campaignId,deviceId]);
    } catch(e){ console.error("[Engine] Offline timeout DB error:",e); }
  }, ms);
  _timers.set(sendKey, h);
}
function clearOfflineTimeout(sendKey) {
  const h = _timers.get(sendKey);
  if (h) { clearTimeout(h); _timers.delete(sendKey); }
}
module.exports.clearOfflineTimeout = clearOfflineTimeout;

// ── DB helpers ────────────────────────────────────────────────────────────
async function _createRun(campaignId, runNumber, by, msgIdx, prompt, audSize) {
  const r = await pool.query(
    `INSERT INTO campaign_runs(campaign_id,run_number,triggered_by,message_index,prompt_snapshot,audience_size)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
    [campaignId,runNumber,by,msgIdx,prompt,audSize]
  );
  return r.rows[0].id;  // campaign_runs.id (bigint)
}

async function _finishRun(runId, sent, failed, skipped) {
  await pool.query(
    `UPDATE campaign_runs SET sent_count=$1,failed_count=$2,skipped_count=$3,status='completed',finished_at=NOW() WHERE id=$4`,
    [sent,failed,skipped,runId]
  );
}

async function _advanceCampaign(id, newRunCount, cursor, newStatus) {
  await pool.query(
    `UPDATE campaigns SET run_count=$1,message_cursor=$2,last_run_at=NOW(),status=$3,updated_at=NOW() WHERE id=$4`,
    [newRunCount,cursor,newStatus,id]
  );
}

// ── Send to one device ────────────────────────────────────────────────────
async function _sendToDevice({ runId, runNumber, campaignId, notifType, offlineMs, deviceId, fcmToken, message }) {
  const sendKey = `ck_${randomUUID().replace(/-/g,"").slice(0,16)}`;
  const prompt  = message.prompt || "";
  const hint    = message.hint   || "Type your answer…";
  const title   = message.title  || null;

  // Insert send record — run_id is the new FK, run_number is legacy denorm
  await pool.query(
    `INSERT INTO campaign_sends(run_id,run_number,campaign_id,device_id,send_key,prompt_snapshot,hint_snapshot)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [runId,runNumber,campaignId,deviceId,sendKey,prompt,hint||null]
  );

  if (!getCachedToken(deviceId)) cacheToken(deviceId, fcmToken);

  try {
    let fcmMsgId;
    if      (notifType==="input")    fcmMsgId = await sendInputRequest(fcmToken,sendKey,prompt,hint);
    else if (notifType==="question") { fcmMsgId = await sendQuestion(fcmToken,sendKey,prompt); armOfflineTimeout(sendKey,deviceId,campaignId,offlineMs); }
    else if (notifType==="simple")   fcmMsgId = await sendSimple(fcmToken,title,prompt);
    else throw new Error(`Unknown notification_type: ${notifType}`);

    pool.query(`UPDATE campaign_sends SET fcm_msg_id=$1 WHERE send_key=$2`,[fcmMsgId,sendKey]).catch(console.error);
    return { ok:true };
  } catch(err) {
    pool.query(`UPDATE campaign_sends SET fcm_error=$1 WHERE send_key=$2`,[String(err.message),sendKey]).catch(console.error);
    if (isTokenInvalid(err)) {
      invalidateToken(deviceId);
      pool.query(`DELETE FROM device_tokens WHERE device_id=$1`,[deviceId]).catch(()=>{});
      console.warn(`[Engine] Purged stale token device=${deviceId}`);
    } else {
      console.error(`[Engine] FCM error device=${deviceId}:`,err.message);
    }
    return { ok:false };
  }
}

// ── Main dispatch ─────────────────────────────────────────────────────────
async function dispatchCampaign(campaignRow, triggeredBy="scheduler") {
  const { rows } = await pool.query(
    `SELECT c.*,
            t.notification_type, t.strategy, t.messages AS tmpl_messages, t.name AS tmpl_name,
            a.type AS aud_type, a.config AS aud_config, a.name AS aud_name
     FROM campaigns c
     JOIN message_templates t ON t.id=c.template_id
     JOIN audiences         a ON a.id=c.audience_id
     WHERE c.id=$1`,
    [campaignRow.id]
  );
  if (!rows.length) { console.warn(`[Engine] Campaign ${campaignRow.id} not found`); return; }
  const c = rows[0];

  const now = new Date();
  if (c.starts_at && new Date(c.starts_at) > now) { console.log(`[Engine] "${c.name}" not started yet`); return; }
  if (c.ends_at   && new Date(c.ends_at)   < now) { await pool.query(`UPDATE campaigns SET status='done',updated_at=NOW() WHERE id=$1`,[c.id]); return; }

  console.log(`[Engine] Dispatching "${c.name}" type=${c.notification_type} aud=${c.aud_name} by=${triggeredBy}`);

  const newRunCount = (c.run_count||0) + 1;

  // TYPE 1: broadcast — topic, no per-device rows
  if (c.notification_type==="broadcast") {
    const msgs = Array.isArray(c.tmpl_messages) ? c.tmpl_messages : [];
    const msg  = msgs[0]||{};
    const runId = await _createRun(c.id,newRunCount,triggeredBy,0,msg.prompt||"",0);
    try {
      await sendBroadcast(msg.title||null, msg.prompt||"");
      await _finishRun(runId,1,0,0);
    } catch(err) {
      await pool.query(`UPDATE campaign_runs SET status='failed',finished_at=NOW() WHERE id=$1`,[runId]);
      console.error("[Engine] Broadcast error:",err.message);
    }
    await _advanceCampaign(c.id,newRunCount,c.message_cursor||0,c.schedule_type==="one_shot"?"done":c.status);
    return;
  }

  let devices = await resolveAudience({ type:c.aud_type, config:c.aud_config });

  // Dedup
  let skipped = 0;
  if ((c.send_dedup_hours||0) > 0 && devices.length > 0) {
    const ids = devices.map(d=>d.device_id);
    const { rows:recent } = await pool.query(
      `SELECT DISTINCT device_id FROM campaign_sends WHERE campaign_id=$1 AND sent_at>NOW()-($2||' hours')::interval AND device_id=ANY($3::text[])`,
      [c.id,String(c.send_dedup_hours),ids]
    );
    const skip = new Set(recent.map(r=>r.device_id));
    skipped = devices.filter(d=>skip.has(d.device_id)).length;
    devices = devices.filter(d=>!skip.has(d.device_id));
    if (skipped>0) console.log(`[Engine] Dedup: skipped ${skipped}`);
  }

  const { message, nextCursor, exhausted } = pickMessage(c.strategy, c.tmpl_messages, c.message_cursor||0);
  const runId = await _createRun(c.id,newRunCount,triggeredBy,c.message_cursor||0,message.prompt||"",devices.length+skipped);

  let sent=0, failed=0;
  for (const { device_id, fcm_token } of devices) {
    const r = await _sendToDevice({ runId,runNumber:newRunCount,campaignId:c.id,notifType:c.notification_type,offlineMs:c.offline_timeout_ms||45000,deviceId:device_id,fcmToken:fcm_token,message });
    if (r.ok) sent++; else failed++;
    await new Promise(r=>setTimeout(r,200));
  }

  await _finishRun(runId,sent,failed,skipped);
  const newStatus = exhausted?"done":c.schedule_type==="one_shot"?"done":c.status;
  await _advanceCampaign(c.id,newRunCount,nextCursor,newStatus);

  console.log(`[Engine] Done "${c.name}" run=${newRunCount} sent=${sent} failed=${failed} skipped=${skipped} → ${newStatus}`);
  return { ok:true, sent, failed, skipped };
}
module.exports.dispatchCampaign = dispatchCampaign;

// ── Scheduler ─────────────────────────────────────────────────────────────
function _wasDue(expr) {
  try {
    return (Date.now() - cronParser.parseExpression(expr,{tz:IST_TZ}).prev().toDate().getTime()) < 61000;
  } catch { return false; }
}

async function _tick() {
  try {
    const { rows } = await pool.query(
      `SELECT id,cron_expr,last_run_at FROM campaigns WHERE status='active' AND cron_expr IS NOT NULL`
    );
    for (const row of rows) {
      if (!_wasDue(row.cron_expr)) continue;
      if (row.last_run_at && Date.now()-new Date(row.last_run_at).getTime()<55000) continue;
      dispatchCampaign(row,"scheduler").catch(e=>console.error(`[Engine] campaign=${row.id}:`,e));
    }
  } catch(e) { console.error("[Engine] Tick error:",e); }
}

function startNotificationEngine() {
  nodeCron.schedule("* * * * *", _tick, { timezone: IST_TZ });
  console.log("✅ [NotificationEngine] Started — IST cron, every minute");
}
module.exports.startNotificationEngine = startNotificationEngine;