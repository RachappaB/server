/**
 * phone.v4.controller.js
 *
 * Handles multi-profile / hidden-app detection data sent by the Android v4 client.
 * All routes are under /api/phonev4/profile/…
 *
 * Does NOT touch v2/v3 tables.
 */

const pool = require("../db");

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/phonev4/profile/day
// Receives the ProfileSnapshot JSON from the Android app and stores it.
// ─────────────────────────────────────────────────────────────────────────────
async function uploadProfileDay(req, res) {
  const body = req.body;

  if (!body || typeof body !== "object") {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const {
    device_id,
    date,
    profile_count           = 1,
    current_user_id         = 0,
    is_work_profile         = false,
    has_managed_profile     = false,
    has_oem_clone_space     = false,
    oem_clone_brand         = null,
    hidden_app_candidates   = [],
    profile_switch_timestamps = [],
    installed_packages      = [],
    notified_packages       = [],
    window_start_ms         = null,
    window_end_ms           = null,
    android_version         = null,
    manufacturer            = null,
    model                   = null,
    timezone                = null,
    client_version          = 4,
  } = body;

  if (!device_id || !date) {
    return res.status(400).json({ ok: false, error: "device_id and date are required" });
  }

  console.log("📱 V4 profile snapshot:", {
    device_id,
    date,
    profile_count,
    has_oem_clone_space,
    oem_clone_brand,
    hidden_count: hidden_app_candidates.length,
    switch_count: profile_switch_timestamps.length,
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. Upsert the main snapshot row ──────────────────────────────────────
    const snapResult = await client.query(
      `
      INSERT INTO profile_snapshots_v4 (
        device_id, snapshot_date,
        profile_count, current_user_id,
        is_work_profile, has_managed_profile,
        has_oem_clone_space, oem_clone_brand,
        hidden_app_candidates, profile_switch_timestamps,
        installed_packages, notified_packages,
        window_start_ms, window_end_ms,
        android_version, manufacturer, model, timezone, client_version
      ) VALUES (
        $1, $2::date,
        $3, $4,
        $5, $6,
        $7, $8,
        $9::text[], $10::bigint[],
        $11::text[], $12::text[],
        $13, $14,
        $15, $16, $17, $18, $19
      )
      ON CONFLICT (device_id, snapshot_date) DO UPDATE SET
        profile_count             = EXCLUDED.profile_count,
        current_user_id           = EXCLUDED.current_user_id,
        is_work_profile           = EXCLUDED.is_work_profile,
        has_managed_profile       = EXCLUDED.has_managed_profile,
        has_oem_clone_space       = EXCLUDED.has_oem_clone_space,
        oem_clone_brand           = EXCLUDED.oem_clone_brand,
        hidden_app_candidates     = EXCLUDED.hidden_app_candidates,
        profile_switch_timestamps = EXCLUDED.profile_switch_timestamps,
        installed_packages        = EXCLUDED.installed_packages,
        notified_packages         = EXCLUDED.notified_packages,
        window_start_ms           = EXCLUDED.window_start_ms,
        window_end_ms             = EXCLUDED.window_end_ms,
        android_version           = EXCLUDED.android_version,
        manufacturer              = EXCLUDED.manufacturer,
        model                     = EXCLUDED.model,
        timezone                  = EXCLUDED.timezone,
        client_version            = EXCLUDED.client_version,
        received_at               = NOW()
      RETURNING id
      `,
      [
        device_id, date,
        profile_count, current_user_id,
        is_work_profile, has_managed_profile,
        has_oem_clone_space, oem_clone_brand,
        hidden_app_candidates, profile_switch_timestamps,
        installed_packages, notified_packages,
        window_start_ms, window_end_ms,
        android_version, manufacturer, model, timezone, client_version,
      ]
    );

    const snapshotId = snapResult.rows[0].id;

    // ── 2. Re-insert hidden app log rows ─────────────────────────────────────
    // Delete stale rows first (re-upload replaces, not appends)
    await client.query(
      `DELETE FROM hidden_app_log_v4 WHERE snapshot_id = $1`,
      [snapshotId]
    );

    if (hidden_app_candidates.length > 0) {
      // Determine the suspected space for each candidate
      const suspectedSpace = has_oem_clone_space
        ? "oem_clone"
        : has_managed_profile
          ? "work_profile"
          : "unknown_profile";

      const halValues = [];
      const halParams = [];
      let p = 1;

      for (const pkg of hidden_app_candidates) {
        halValues.push(`($${p++}, $${p++}, $${p++}::date, $${p++}, $${p++})`);
        halParams.push(snapshotId, device_id, date, pkg, suspectedSpace);
      }

      await client.query(
        `
        INSERT INTO hidden_app_log_v4
          (snapshot_id, device_id, snapshot_date, package_name, suspected_space)
        VALUES ${halValues.join(",")}
        ON CONFLICT (snapshot_id, package_name) DO UPDATE SET
          suspected_space = EXCLUDED.suspected_space,
          recorded_at     = NOW()
        `,
        halParams
      );
    }

    // ── 3. Re-insert profile switch log rows ─────────────────────────────────
    await client.query(
      `DELETE FROM profile_switch_log_v4 WHERE snapshot_id = $1`,
      [snapshotId]
    );

    if (profile_switch_timestamps.length > 0) {
      const pslValues = [];
      const pslParams = [];
      let p = 1;

      for (const ts of profile_switch_timestamps) {
        pslValues.push(`($${p++}, $${p++}, $${p++}::date, $${p++})`);
        pslParams.push(snapshotId, device_id, date, ts);
      }

      await client.query(
        `
        INSERT INTO profile_switch_log_v4
          (snapshot_id, device_id, snapshot_date, switched_at_ms)
        VALUES ${pslValues.join(",")}
        `,
        pslParams
      );
    }

    await client.query("COMMIT");

    return res.json({
      ok: true,
      device_id,
      date,
      snapshot_id:  snapshotId,
      hidden_saved: hidden_app_candidates.length,
      switches_saved: profile_switch_timestamps.length,
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("uploadProfileDay v4 error:", err);
    return res.status(500).json({ ok: false, error: "Failed to store profile snapshot", details: err.message });
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/phonev4/profile/:device_id
// All snapshots for a device, newest first
// ─────────────────────────────────────────────────────────────────────────────
async function getProfileByDevice(req, res) {
  const { device_id } = req.params;
  try {
    const result = await pool.query(
      `
      SELECT
        id, snapshot_date, profile_count, current_user_id,
        is_work_profile, has_managed_profile,
        has_oem_clone_space, oem_clone_brand,
        hidden_app_candidates, profile_switch_timestamps,
        installed_packages, notified_packages,
        android_version, manufacturer, model, timezone,
        received_at
      FROM profile_snapshots_v4
      WHERE device_id = $1
      ORDER BY snapshot_date DESC
      `,
      [device_id]
    );
    res.json({ ok: true, device_id, count: result.rowCount, data: result.rows });
  } catch (err) {
    console.error("getProfileByDevice error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/phonev4/profile/:device_id/latest
// Most recent snapshot only
// ─────────────────────────────────────────────────────────────────────────────
async function getLatestProfile(req, res) {
  const { device_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM v_latest_profile_snapshot WHERE device_id = $1`,
      [device_id]
    );
    if (result.rowCount === 0) {
      return res.json({ ok: true, device_id, data: null, message: "No profile data yet" });
    }
    res.json({ ok: true, device_id, data: result.rows[0] });
  } catch (err) {
    console.error("getLatestProfile error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/phonev4/profile/:device_id/hidden-apps
// All packages that have ever been flagged as hidden for this device
// ─────────────────────────────────────────────────────────────────────────────
async function getHiddenApps(req, res) {
  const { device_id } = req.params;
  try {
    const result = await pool.query(
      `
      SELECT
        package_name,
        suspected_space,
        COUNT(DISTINCT snapshot_date)  AS days_seen_hidden,
        MIN(snapshot_date)             AS first_seen,
        MAX(snapshot_date)             AS last_seen
      FROM hidden_app_log_v4
      WHERE device_id = $1
      GROUP BY package_name, suspected_space
      ORDER BY days_seen_hidden DESC, last_seen DESC
      `,
      [device_id]
    );
    res.json({ ok: true, device_id, count: result.rowCount, data: result.rows });
  } catch (err) {
    console.error("getHiddenApps error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/phonev4/profile/:device_id/switches
// All inferred profile-switch events for this device
// Query params: ?days=7  or  ?from=2026-03-01&to=2026-03-30
// ─────────────────────────────────────────────────────────────────────────────
async function getProfileSwitches(req, res) {
  const { device_id } = req.params;

  let fromDate = null;
  let toDate   = null;

  if (req.query.days) {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
    const from = new Date();
    from.setDate(from.getDate() - days + 1);
    fromDate = from.toISOString().slice(0, 10);
    toDate   = new Date().toISOString().slice(0, 10);
  } else {
    fromDate = req.query.from || null;
    toDate   = req.query.to   || null;
  }

  const conditions = ["device_id = $1"];
  const params     = [device_id];
  let   idx        = 2;

  if (fromDate) { conditions.push(`snapshot_date >= $${idx++}::date`); params.push(fromDate); }
  if (toDate)   { conditions.push(`snapshot_date <= $${idx++}::date`); params.push(toDate);   }

  try {
    const result = await pool.query(
      `
      SELECT
        id, snapshot_date,
        switched_at_ms,
        switched_at,
        recorded_at
      FROM profile_switch_log_v4
      WHERE ${conditions.join(" AND ")}
      ORDER BY switched_at_ms ASC
      `,
      params
    );
    res.json({ ok: true, device_id, count: result.rowCount, data: result.rows });
  } catch (err) {
    console.error("getProfileSwitches error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/phonev4/profile/:device_id/day/:date
// Full snapshot for a specific date
// ─────────────────────────────────────────────────────────────────────────────
async function getProfileByDate(req, res) {
  const { device_id, date } = req.params;
  try {
    const snap = await pool.query(
      `SELECT * FROM profile_snapshots_v4 WHERE device_id=$1 AND snapshot_date=$2::date`,
      [device_id, date]
    );
    if (snap.rowCount === 0) {
      return res.json({ ok: true, device_id, date, data: null });
    }
    const snapshotId = snap.rows[0].id;

    const hidden = await pool.query(
      `SELECT package_name, suspected_space FROM hidden_app_log_v4 WHERE snapshot_id=$1 ORDER BY package_name`,
      [snapshotId]
    );
    const switches = await pool.query(
      `SELECT switched_at_ms, switched_at FROM profile_switch_log_v4 WHERE snapshot_id=$1 ORDER BY switched_at_ms`,
      [snapshotId]
    );

    res.json({
      ok: true, device_id, date,
      data: {
        ...snap.rows[0],
        hidden_app_details:   hidden.rows,
        profile_switch_detail: switches.rows,
      },
    });
  } catch (err) {
    console.error("getProfileByDate error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/phonev4/profile/all/hidden-apps
// Cross-device: which packages are hidden across all users (admin view)
// ─────────────────────────────────────────────────────────────────────────────
async function getAllHiddenApps(req, res) {
  try {
    const result = await pool.query(
      `SELECT * FROM v_hidden_apps_summary ORDER BY days_seen_hidden DESC LIMIT 200`
    );
    res.json({ ok: true, count: result.rowCount, data: result.rows });
  } catch (err) {
    console.error("getAllHiddenApps error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/phonev4/profile/all/devices
// All devices that have submitted a v4 snapshot
// ─────────────────────────────────────────────────────────────────────────────
async function getAllV4Devices(req, res) {
  try {
    const result = await pool.query(
      `SELECT * FROM v_latest_profile_snapshot ORDER BY received_at DESC`
    );
    res.json({ ok: true, count: result.rowCount, data: result.rows });
  } catch (err) {
    console.error("getAllV4Devices error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = {
  uploadProfileDay,
  getProfileByDevice,
  getLatestProfile,
  getHiddenApps,
  getProfileSwitches,
  getProfileByDate,
  getAllHiddenApps,
  getAllV4Devices,
};