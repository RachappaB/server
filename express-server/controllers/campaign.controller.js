/**
 * controllers/campaign.controller.js
 * All queries written against verified actual schema.
 */

const pool = require("../db");
const { dispatchCampaign, clearOfflineTimeout, resolveAudience, SEGMENTS } = require("../notificationEngine");

// ─── Android universal response ───────────────────────────────────────────────
async function submitCampaignResponse(req, res) {
  const { device_id, send_key, response, answered_at } = req.body;
  if (!device_id||!send_key||response==null||String(response).trim()==="")
    return res.status(400).json({ ok:false, error:"device_id, send_key, response required" });
  try {
    const { rows } = await pool.query(
      `SELECT campaign_id,device_id FROM campaign_sends WHERE send_key=$1`,[send_key]
    );
    if (!rows.length)                    return res.status(404).json({ ok:false, error:"send_key not found" });
    if (rows[0].device_id !== device_id) return res.status(403).json({ ok:false, error:"send_key not yours" });
    clearOfflineTimeout(send_key);
    await pool.query(
      `INSERT INTO campaign_responses(send_key,campaign_id,device_id,response,answered_at)
       VALUES($1,$2,$3,$4,$5::timestamptz)
       ON CONFLICT(send_key) DO UPDATE SET response=EXCLUDED.response,answered_at=EXCLUDED.answered_at,received_at=NOW()`,
      [send_key,rows[0].campaign_id,device_id,String(response).trim(),answered_at||null]
    );
    return res.json({ ok:true, send_key, input_id:send_key });
  } catch(e){ console.error("submitCampaignResponse:",e); return res.status(500).json({ ok:false, error:e.message }); }
}

// ─── Dashboard stats ──────────────────────────────────────────────────────────
async function getDashboardStats(req, res) {
  try {
    const [camps, devs, resps, runsToday] = await Promise.all([
      pool.query(`SELECT status,COUNT(*) FROM campaigns GROUP BY status`),
      pool.query(`SELECT COUNT(*) FROM device_tokens`),
      pool.query(`SELECT COUNT(*) FROM campaign_responses WHERE received_at>=NOW()-INTERVAL '24 hours'`),
      pool.query(`SELECT COUNT(*) FROM campaign_runs WHERE started_at AT TIME ZONE 'Asia/Kolkata'>=CURRENT_DATE`),
    ]);
    const cm = {};
    camps.rows.forEach(r => { cm[r.status] = parseInt(r.count); });
    return res.json({
      ok:true,
      campaigns:{ active:cm.active||0, paused:cm.paused||0, done:cm.done||0 },
      devices:     parseInt(devs.rows[0].count),
      responses_24h: parseInt(resps.rows[0].count),
      runs_today:    parseInt(runsToday.rows[0].count),
    });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

// ─── Audiences ────────────────────────────────────────────────────────────────
async function listAudiences(req, res) {
  try {
    const r = await pool.query(`SELECT * FROM audiences ORDER BY name`);
    return res.json({ ok:true, data:r.rows });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function createAudience(req, res) {
  const { name, description, type, config={} } = req.body;
  if (!name||!type) return res.status(400).json({ ok:false, error:"name and type required" });
  if (!["all","device","group","segment"].includes(type)) return res.status(400).json({ ok:false, error:"invalid type" });
  try {
    const r = await pool.query(
      `INSERT INTO audiences(name,description,type,config) VALUES($1,$2,$3,$4) RETURNING *`,
      [name,description||null,type,JSON.stringify(config)]
    );
    return res.json({ ok:true, audience:r.rows[0] });
  } catch(e){
    if (e.code==="23505") return res.status(409).json({ ok:false, error:"Name already exists" });
    return res.status(500).json({ ok:false, error:e.message });
  }
}

async function updateAudience(req, res) {
  const { id } = req.params;
  const ups=[], vals=[]; let i=1;
  if (req.body.name        !==undefined){ ups.push(`name=$${i++}`);        vals.push(req.body.name); }
  if (req.body.description !==undefined){ ups.push(`description=$${i++}`); vals.push(req.body.description); }
  if (req.body.config      !==undefined){ ups.push(`config=$${i++}`);      vals.push(JSON.stringify(req.body.config)); }
  if (!ups.length) return res.status(400).json({ ok:false, error:"Nothing to update" });
  ups.push(`updated_at=NOW()`); vals.push(id);
  try {
    const r = await pool.query(`UPDATE audiences SET ${ups.join(",")} WHERE id=$${i} RETURNING *`,vals);
    if (!r.rowCount) return res.status(404).json({ ok:false, error:"Not found" });
    return res.json({ ok:true, audience:r.rows[0] });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function deleteAudience(req, res) {
  try {
    await pool.query(`DELETE FROM audiences WHERE id=$1`,[req.params.id]);
    return res.json({ ok:true });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function previewAudience(req, res) {
  try {
    const { rows } = await pool.query(`SELECT type,config FROM audiences WHERE id=$1`,[req.params.id]);
    if (!rows.length) return res.status(404).json({ ok:false, error:"Not found" });
    const devices = await resolveAudience({ type:rows[0].type, config:rows[0].config });
    return res.json({ ok:true, device_count:devices.length, device_ids:devices.map(d=>d.device_id) });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function listSegmentFilters(req, res) {
  return res.json({ ok:true, filters:[
    { name:"active_7d",        label:"Active — last 7 days" },
    { name:"active_14d",       label:"Active — last 14 days" },
    { name:"inactive_14d",     label:"Inactive — 14 days" },
    { name:"inactive_30d",     label:"Inactive — 30 days" },
    { name:"never_responded",  label:"Never responded" },
    { name:"responded_today",  label:"Responded today (IST)" },
    { name:"no_response_7d",   label:"No response — 7 days" },
    { name:"custom_tag",       label:"Custom tag (key:value)", requires_extra:true },
  ]});
}

// ─── Templates ────────────────────────────────────────────────────────────────
async function listTemplates(req, res) {
  try {
    const r = await pool.query(`SELECT * FROM message_templates ORDER BY name`);
    return res.json({ ok:true, data:r.rows });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function createTemplate(req, res) {
  const { name, description, notification_type, strategy="static", messages } = req.body;
  if (!name||!notification_type) return res.status(400).json({ ok:false, error:"name and notification_type required" });
  if (!Array.isArray(messages)||!messages.length) return res.status(400).json({ ok:false, error:"messages must be a non-empty array" });
  if (!["input","question","broadcast","simple"].includes(notification_type)) return res.status(400).json({ ok:false, error:"invalid notification_type" });
  if (!["static","rotating","sequential","random"].includes(strategy)) return res.status(400).json({ ok:false, error:"invalid strategy" });
  try {
    const r = await pool.query(
      `INSERT INTO message_templates(name,description,notification_type,strategy,messages) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [name,description||null,notification_type,strategy,JSON.stringify(messages)]
    );
    return res.json({ ok:true, template:r.rows[0] });
  } catch(e){
    if (e.code==="23505") return res.status(409).json({ ok:false, error:"Name already exists" });
    return res.status(500).json({ ok:false, error:e.message });
  }
}

async function updateTemplate(req, res) {
  const { id } = req.params;
  const ups=[], vals=[]; let i=1;
  if (req.body.name        !==undefined){ ups.push(`name=$${i++}`);        vals.push(req.body.name); }
  if (req.body.description !==undefined){ ups.push(`description=$${i++}`); vals.push(req.body.description); }
  if (req.body.strategy    !==undefined){ ups.push(`strategy=$${i++}`);    vals.push(req.body.strategy); }
  if (req.body.messages    !==undefined){ ups.push(`messages=$${i++}`);    vals.push(JSON.stringify(req.body.messages)); }
  if (!ups.length) return res.status(400).json({ ok:false, error:"Nothing to update" });
  ups.push(`updated_at=NOW()`); vals.push(id);
  try {
    const r = await pool.query(`UPDATE message_templates SET ${ups.join(",")} WHERE id=$${i} RETURNING *`,vals);
    if (!r.rowCount) return res.status(404).json({ ok:false, error:"Not found" });
    return res.json({ ok:true, template:r.rows[0] });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function deleteTemplate(req, res) {
  try {
    await pool.query(`DELETE FROM message_templates WHERE id=$1`,[req.params.id]);
    return res.json({ ok:true });
  } catch(e){
    if (e.code==="23503") return res.status(409).json({ ok:false, error:"Template is used by campaigns — archive campaigns first" });
    return res.status(500).json({ ok:false, error:e.message });
  }
}

// ─── Campaigns ────────────────────────────────────────────────────────────────
async function listCampaigns(req, res) {
  try {
    const statusFilter = req.query.status ? `WHERE c.status=$1` : "";
    const params = req.query.status ? [req.query.status] : [];
    const r = await pool.query(`
      SELECT c.*,
             a.name AS aud_name, a.type AS aud_type,
             t.name AS tpl_name, t.notification_type, t.strategy,
             (SELECT COUNT(*) FROM campaign_sends cs WHERE cs.campaign_id=c.id)    AS total_sent,
             (SELECT COUNT(*) FROM campaign_responses cr WHERE cr.campaign_id=c.id) AS total_responded,
             (SELECT COUNT(*) FROM campaign_runs cr WHERE cr.campaign_id=c.id)      AS total_runs
      FROM campaigns c
      JOIN audiences         a ON a.id=c.audience_id
      JOIN message_templates t ON t.id=c.template_id
      ${statusFilter}
      ORDER BY c.created_at DESC
    `, params);
    return res.json({ ok:true, count:r.rowCount, data:r.rows });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function getCampaign(req, res) {
  try {
    const r = await pool.query(`
      SELECT c.*, a.name AS aud_name, a.type AS aud_type, a.config AS aud_config,
             t.name AS tpl_name, t.notification_type, t.strategy, t.messages AS tpl_messages
      FROM campaigns c
      JOIN audiences a ON a.id=c.audience_id
      JOIN message_templates t ON t.id=c.template_id
      WHERE c.id=$1`,[req.params.id]);
    if (!r.rowCount) return res.status(404).json({ ok:false, error:"Not found" });
    return res.json({ ok:true, campaign:r.rows[0] });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function createCampaign(req, res) {
  const { name, description, audience_id, template_id, schedule_type="recurring",
          cron_expr, offline_timeout_ms=45000, send_dedup_hours=0,
          priority="normal", starts_at, ends_at } = req.body;
  if (!name||!audience_id||!template_id) return res.status(400).json({ ok:false, error:"name, audience_id, template_id required" });
  if (!["recurring","one_shot","drip"].includes(schedule_type)) return res.status(400).json({ ok:false, error:"invalid schedule_type" });
  if (schedule_type!=="one_shot"&&!cron_expr) return res.status(400).json({ ok:false, error:"cron_expr required for recurring/drip" });
  if (!["normal","high"].includes(priority)) return res.status(400).json({ ok:false, error:"priority must be normal or high" });
  try {
    const r = await pool.query(
      `INSERT INTO campaigns(name,description,audience_id,template_id,schedule_type,cron_expr,
         offline_timeout_ms,send_dedup_hours,priority,starts_at,ends_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::timestamptz) RETURNING *`,
      [name,description||null,audience_id,template_id,schedule_type,cron_expr||null,
       offline_timeout_ms,send_dedup_hours,priority,starts_at||null,ends_at||null]
    );
    return res.json({ ok:true, campaign:r.rows[0] });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function updateCampaign(req, res) {
  const { id } = req.params;
  const allowed = ["name","description","cron_expr","status","offline_timeout_ms","send_dedup_hours","priority","starts_at","ends_at","message_cursor"];
  const ups=[], vals=[]; let i=1;
  for (const f of allowed) {
    if (req.body[f]!==undefined){ ups.push(`${f}=$${i++}`); vals.push(req.body[f]); }
  }
  if (!ups.length) return res.status(400).json({ ok:false, error:"Nothing to update" });
  ups.push(`updated_at=NOW()`); vals.push(id);
  try {
    const r = await pool.query(`UPDATE campaigns SET ${ups.join(",")} WHERE id=$${i} RETURNING *`,vals);
    if (!r.rowCount) return res.status(404).json({ ok:false, error:"Not found" });
    return res.json({ ok:true, campaign:r.rows[0] });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function deleteCampaign(req, res) {
  try {
    await pool.query(`UPDATE campaigns SET status='done',updated_at=NOW() WHERE id=$1`,[req.params.id]);
    return res.json({ ok:true });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function runCampaignNow(req, res) {
  try {
    const { rows } = await pool.query(`SELECT id,status FROM campaigns WHERE id=$1`,[req.params.id]);
    if (!rows.length) return res.status(404).json({ ok:false, error:"Not found" });
    if (rows[0].status==="done") return res.status(400).json({ ok:false, error:"Campaign archived. Unarchive first (set status=active)." });
    dispatchCampaign(rows[0],"admin").catch(e=>console.error(`runNow campaign=${req.params.id}:`,e));
    return res.json({ ok:true, message:"Dispatch started" });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function cloneCampaign(req, res) {
  try {
    const { rows } = await pool.query(`SELECT * FROM campaigns WHERE id=$1`,[req.params.id]);
    if (!rows.length) return res.status(404).json({ ok:false, error:"Not found" });
    const c = rows[0];
    const r = await pool.query(
      `INSERT INTO campaigns(name,description,audience_id,template_id,schedule_type,cron_expr,
         offline_timeout_ms,send_dedup_hours,priority,starts_at,ends_at,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'paused') RETURNING *`,
      [`${c.name} (copy)`,c.description,c.audience_id,c.template_id,c.schedule_type,
       c.cron_expr,c.offline_timeout_ms,c.send_dedup_hours||0,c.priority||'normal',c.starts_at,c.ends_at]
    );
    return res.json({ ok:true, campaign:r.rows[0] });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function getCampaignRuns(req, res) {
  const limit = Math.min(Number(req.query.limit)||50, 200);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM campaign_runs WHERE campaign_id=$1 ORDER BY started_at DESC LIMIT $2`,
      [req.params.id, limit]
    );
    return res.json({ ok:true, data:rows });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function getCampaignResponses(req, res) {
  const { id } = req.params;
  const limit   = Math.min(Number(req.query.limit)||100, 500);
  const { device_id, run_number } = req.query;
  // Join campaign_sends (for prompt/run info) with campaign_responses
  const conds=["cs.campaign_id=$1"], vals=[id]; let i=2;
  if (device_id)  { conds.push(`cs.device_id=$${i++}`);                     vals.push(device_id); }
  if (run_number) { conds.push(`cs.run_number=$${i++}`);                     vals.push(run_number); }
  vals.push(limit);
  try {
    const { rows } = await pool.query(`
      SELECT cs.send_key, cs.device_id, cs.run_number, cs.prompt_snapshot,
             cs.hint_snapshot, cs.sent_at, cs.fcm_error,
             cr.response, cr.answered_at, cr.received_at,
             run.triggered_by,
             CASE WHEN cr.response IS NULL THEN 'pending' ELSE 'answered' END AS status
      FROM campaign_sends cs
      LEFT JOIN campaign_responses cr  ON cr.send_key=cs.send_key
      LEFT JOIN campaign_runs      run ON run.id=cs.run_id
      WHERE ${conds.join(" AND ")}
      ORDER BY cs.sent_at DESC
      LIMIT $${i}`, vals);
    const total    = rows.length;
    const answered = rows.filter(r=>r.response!=null).length;
    return res.json({
      ok:true, campaign_id:id,
      stats:{ total_sent:total, total_answered:answered,
              response_rate:total>0?Math.round(answered/total*100):0 },
      data:rows,
    });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

// ─── Devices ──────────────────────────────────────────────────────────────────
async function listDevices(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT dt.device_id, dt.platform, dt.registered_at, dt.updated_at,
             dm.display_name, dm.tags, dm.notes, dm.last_active,
             COALESCE(ARRAY_AGG(dg.group_name) FILTER (WHERE dg.group_name IS NOT NULL),'{}') AS groups
      FROM device_tokens dt
      LEFT JOIN device_metadata dm ON dm.device_id=dt.device_id
      LEFT JOIN device_groups   dg ON dg.device_id=dt.device_id
      GROUP BY dt.device_id,dt.platform,dt.registered_at,dt.updated_at,
               dm.display_name,dm.tags,dm.notes,dm.last_active
      ORDER BY dt.updated_at DESC NULLS LAST`);
    return res.json({ ok:true, count:rows.length, devices:rows });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function updateDeviceMetadata(req, res) {
  const { device_id } = req.params;
  const { display_name, tags, notes } = req.body;
  try {
    await pool.query(
      `INSERT INTO device_metadata(device_id,display_name,tags,notes)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(device_id) DO UPDATE SET
         display_name=COALESCE(EXCLUDED.display_name,device_metadata.display_name),
         tags=COALESCE(EXCLUDED.tags,device_metadata.tags),
         notes=COALESCE(EXCLUDED.notes,device_metadata.notes)`,
      [device_id,display_name||null,tags?JSON.stringify(tags):null,notes||null]
    );
    return res.json({ ok:true });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

// ─── Groups ───────────────────────────────────────────────────────────────────
async function listGroups(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT group_name,COUNT(*) AS device_count,MIN(added_at) AS created_at FROM device_groups GROUP BY group_name ORDER BY group_name`
    );
    return res.json({ ok:true, data:rows });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function getGroupMembers(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT dg.device_id,dg.added_at,dg.added_by,dm.display_name FROM device_groups dg
       LEFT JOIN device_metadata dm ON dm.device_id=dg.device_id
       WHERE dg.group_name=$1 ORDER BY dg.added_at DESC`,
      [req.params.group]
    );
    return res.json({ ok:true, group:req.params.group, members:rows });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function addToGroup(req, res) {
  const { device_id } = req.params;
  const { group_name } = req.body;
  if (!group_name?.trim()) return res.status(400).json({ ok:false, error:"group_name required" });
  try {
    await pool.query(
      `INSERT INTO device_groups(device_id,group_name,added_by) VALUES($1,$2,'admin') ON CONFLICT DO NOTHING`,
      [device_id,group_name.trim()]
    );
    return res.json({ ok:true });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function removeFromGroup(req, res) {
  const { device_id, group } = req.params;
  try {
    await pool.query(`DELETE FROM device_groups WHERE device_id=$1 AND group_name=$2`,[device_id,group]);
    return res.json({ ok:true });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

async function deleteGroup(req, res) {
  try {
    await pool.query(`DELETE FROM device_groups WHERE group_name=$1`,[req.params.group]);
    return res.json({ ok:true });
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
}

module.exports = {
  submitCampaignResponse,
  getDashboardStats,
  listAudiences, createAudience, updateAudience, deleteAudience, previewAudience, listSegmentFilters,
  listTemplates, createTemplate, updateTemplate, deleteTemplate,
  listCampaigns, getCampaign, createCampaign, updateCampaign, deleteCampaign,
  runCampaignNow, cloneCampaign, getCampaignRuns, getCampaignResponses,
  listDevices, updateDeviceMetadata,
  listGroups, getGroupMembers, addToGroup, removeFromGroup, deleteGroup,
};