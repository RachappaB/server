const pool = require("../db");

// ======================================================
// SAVE MOTION DATA (ESP32)
// ======================================================


async function saveMotionData(req, res) {

  try {

    console.log("save values");
    console.log(req.body);

    const { bucket, motion } = req.body;

    // ===== VALIDATION =====

    if (typeof bucket !== "number") {
      return res.status(400).json({ error: "Invalid bucket" });
    }

    if (!Array.isArray(motion)) {
      return res.status(400).json({ error: "Motion must be array" });
    }

    if (motion.length === 0) {
      return res.status(400).json({ error: "Motion empty" });
    }

    // Ensure all values are integers (0-4)

    for (let v of motion) {

      if (!Number.isInteger(v) || v < 0 || v > 4) {

        return res.status(400).json({
          error: "Invalid motion value",
          value: v
        });
      }
    }

    // ===== INSERT =====

    await pool.query(

      `
      INSERT INTO fitband_activity_logs
      (bucket, motion_data)
      VALUES ($1, $2)
      `,

      [bucket, motion]

    );

    res.json({ ok: true });

  } catch (err) {

    console.error("Motion Insert Error:", err);

    res.status(500).json({ ok: false });

  }
}



















// ======================================================
// GET MOTION LOGS (DASHBOARD)
// ======================================================

async function getMotionLogs(req, res) {

  try {

    const result = await pool.query(
      `
      SELECT * 
      FROM fitband_activity_logs
      ORDER BY id DESC
      LIMIT 50
      `
    );

    res.json(result.rows);

  } catch (err) {

    console.error("Motion Fetch Error:", err);
    res.status(500).json([]);

  }
}


// ======================================================
// GET UPCOMING ALARMS (ESP32)
// ======================================================

async function getAlarm(req, res) {

  try {

    const result = await pool.query(
      `
      SELECT id, alarm_time, repeat, vibrate_ms
      FROM fitband_alarms
      WHERE enabled = true
      ORDER BY alarm_time ASC
      `
    );

    if (result.rows.length === 0) {
      return res.json({ ok: true, alarms: [] });
    }

    // Current UTC time
    const nowUtcMs = Date.now();

    // IST offset (5h 30m)
    const IST_OFFSET_MS = 19800 * 1000;

    // Current IST timestamp
    const istNowMs = nowUtcMs + IST_OFFSET_MS;

    const istNow = new Date(istNowMs);

    const alarms = [];

    for (const row of result.rows) {

      const [hh, mm, ss] = row.alarm_time.split(":").map(Number);

      const alarmDate = new Date(istNow);

      alarmDate.setHours(hh);
      alarmDate.setMinutes(mm);
      alarmDate.setSeconds(ss || 0);
      alarmDate.setMilliseconds(0);

      // If time already passed today → schedule tomorrow
      if (alarmDate.getTime() <= istNowMs) {
        alarmDate.setDate(alarmDate.getDate() + 1);
      }

      alarms.push({
        id: row.id,
        epoch_ist: Math.floor(alarmDate.getTime() / 1000),
        vibrate_ms: row.vibrate_ms,
        repeat: row.repeat
      });
    }

    res.json({
      ok: true,
      alarms
    });

  } catch (err) {

    console.error("Alarm Fetch Error:", err);
    res.status(500).json({ ok: false, alarms: [] });

  }
}


// ======================================================
// ACK ALARM FROM ESP32
// ======================================================

async function ackAlarm(req, res) {

  try {

    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ ok: false });
    }

    await pool.query(
      `
      UPDATE fitband_alarms
      SET last_triggered = NOW(),
          enabled = CASE
                      WHEN repeat = false THEN false
                      ELSE true
                    END
      WHERE id = $1
      `,
      [id]
    );

    res.json({ ok: true });

  } catch (err) {

    console.error("Alarm ACK Error:", err);
    res.status(500).json({ ok: false });

  }
}


// ======================================================
// CREATE ALARM (DASHBOARD / MOBILE APP)
// ======================================================

async function createAlarm(req, res) {

  try {

    const { alarm_time, repeat, vibrate_ms } = req.body;

    if (!alarm_time || !vibrate_ms) {
      return res.status(400).json({ ok: false });
    }

    await pool.query(
      `
      INSERT INTO fitband_alarms
      (alarm_time, repeat, vibrate_ms, enabled)
      VALUES ($1, $2, $3, true)
      `,
      [alarm_time, repeat || false, vibrate_ms]
    );

    res.json({ ok: true });

  } catch (err) {

    console.error("Alarm Create Error:", err);
    res.status(500).json({ ok: false });

  }
}


// ======================================================
// DELETE ALARM
// ======================================================

async function deleteAlarm(req, res) {

  try {

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ ok: false });
    }

    await pool.query(
      `DELETE FROM fitband_alarms WHERE id = $1`,
      [id]
    );

    res.json({ ok: true });

  } catch (err) {

    console.error("Alarm Delete Error:", err);
    res.status(500).json({ ok: false });

  }
}


// ======================================================
// EXPORT CONTROLLER FUNCTIONS
// ======================================================

module.exports = {

  // Device APIs
  saveMotionData,
  getAlarm,
  ackAlarm,

  // Dashboard APIs
  getMotionLogs,
  createAlarm,
  deleteAlarm

};
