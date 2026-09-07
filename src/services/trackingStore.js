import crypto from "crypto";
import pool from "./db.js";

export const trackingLinks = new Map();
export const trackingHistory = new Map();
export const activeSessions = new Map();
export const latestLocations = new Map();
export const adminRooms = new Map();

export function generateToken() {
  return crypto.randomBytes(12).toString("base64url");
}

function makeSession(link) {
  return {
    trackingId: link.trackingId,
    token: link.token,
    name: link.name,
    status: "active",
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    stoppedAt: null,
    stopReason: null,
    lastSeenAt: null,
    points: [],
  };
}

export async function createTrackingLink({ name, expiryMinutes }) {
  const token = generateToken();
  const trackingId = `TRK-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const now = Date.now();
  const link = {
    token,
    trackingId,
    name: name || "Unnamed Tracking",
    status: "active",
    createdAt: now,
    expiresAt: now + expiryMinutes * 60 * 1000,
    useCount: 0,
  };
  trackingLinks.set(token, link);
  trackingHistory.set(trackingId, makeSession(link));

  try {
    await pool.query(
      `INSERT INTO tracking_links (token, tracking_id, name, status, created_at, expires_at, use_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (token) DO NOTHING`,
      [token, trackingId, link.name, link.status, now, link.expiresAt, 0]
    );
    await pool.query(
      `INSERT INTO tracking_sessions (tracking_id, token, name, status, created_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [trackingId, token, link.name, "active", now, link.expiresAt]
    );
  } catch (err) {
    console.error("Failed to persist new link:", err.message);
  }
  return link;
}

function fromLinkRow(row) {
  return {
    token: row.token,
    trackingId: row.tracking_id,
    name: row.name,
    status: row.status,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    useCount: row.use_count,
  };
}

function fromSessionRow(row) {
  return {
    trackingId: row.tracking_id,
    token: row.token,
    name: row.name,
    status: row.status,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    stoppedAt: row.stopped_at != null ? Number(row.stopped_at) : null,
    stopReason: row.stop_reason,
    lastSeenAt: row.last_seen_at != null ? Number(row.last_seen_at) : null,
    points: [],
  };
}

export function getTrackingLink(token) {
  return trackingLinks.get(token) || null;
}

export async function deactivateLink(token) {
  const link = trackingLinks.get(token);
  if (!link) return null;
  link.status = "deactivated";
  const session = trackingHistory.get(link.trackingId);
  if (session) {
    session.status = "deactivated";
    session.stopReason = "deactivated";
    session.stoppedAt = session.stoppedAt || Date.now();
  }
  try {
    await pool.query(
      `UPDATE tracking_links SET status=$1 WHERE token=$2`,
      ["deactivated", token]
    );
    await pool.query(
      `UPDATE tracking_sessions SET status=$1, stop_reason=$2, stopped_at=COALESCE(stopped_at, $3)
       WHERE tracking_id=$4`,
      ["deactivated", "deactivated", session?.stoppedAt || Date.now(), link.trackingId]
    );
  } catch (err) {
    console.error("Failed to persist deactivation:", err.message);
  }
  return link;
}

export function isLinkValid(link) {
  if (!link) return false;
  if (link.status !== "active") return false;
  if (Date.now() > link.expiresAt) return false;
  return true;
}

export async function markExpiredIfDue(link) {
  if (link && link.status === "active" && Date.now() > link.expiresAt) {
    link.status = "expired";
    const session = trackingHistory.get(link.trackingId);
    if (session) {
      session.status = "expired";
      session.stopReason = "expired";
      session.stoppedAt = session.stoppedAt || Date.now();
    }
    try {
      await pool.query(
        `UPDATE tracking_links SET status=$1 WHERE token=$2`,
        ["expired", link.token]
      );
      await pool.query(
        `UPDATE tracking_sessions SET status=$1, stop_reason=$2, stopped_at=COALESCE(stopped_at, $3)
         WHERE tracking_id=$4`,
        ["expired", "expired", session?.stoppedAt || Date.now(), link.trackingId]
      );
    } catch (err) {
      console.error("Failed to persist expiry:", err.message);
    }
    return true;
  }
  return false;
}

export function getSession(trackingId) {
  return trackingHistory.get(trackingId) || null;
}

export async function appendPoint(trackingId, point, link) {
  let session = trackingHistory.get(trackingId);
  if (!session && link) {
    session = makeSession(link);
    trackingHistory.set(trackingId, session);
  }
  if (!session) return null;
  session.points.push(point);
  session.lastSeenAt = point.timestamp || Date.now();
  if (session.status !== "active") {
    session.status = "active";
    session.stopReason = null;
    session.stoppedAt = null;
  }
  try {
    await pool.query(
      `INSERT INTO tracking_points (tracking_id, latitude, longitude, accuracy, timestamp)
       VALUES ($1,$2,$3,$4,$5)`,
      [trackingId, point.latitude, point.longitude, point.accuracy, point.timestamp]
    );
    await pool.query(
      `UPDATE tracking_sessions SET status=$1, last_seen_at=$2, stop_reason=NULL, stopped_at=NULL
       WHERE tracking_id=$3`,
      ["active", session.lastSeenAt, trackingId]
    );
    await pool.query(
      `UPDATE tracking_links SET status=$1 WHERE token=$2`,
      ["active", link?.token]
    );
  } catch (err) {
    console.error("Failed to persist point:", err.message);
  }
  return session;
}

export async function markStopped(trackingId) {
  const session = trackingHistory.get(trackingId);
  if (!session) return null;
  session.status = "stopped";
  session.stopReason = "user_stopped";
  session.stoppedAt = Date.now();
  try {
    await pool.query(
      `UPDATE tracking_sessions SET status=$1, stop_reason=$2, stopped_at=$3
       WHERE tracking_id=$4`,
      ["stopped", "user_stopped", session.stoppedAt, trackingId]
    );
  } catch (err) {
    console.error("Failed to persist stop:", err.message);
  }
  return session;
}

export async function markDisconnected(trackingId) {
  const session = trackingHistory.get(trackingId);
  if (session) {
    session.status = "disconnected";
    try {
      await pool.query(
        `UPDATE tracking_sessions SET status=$1 WHERE tracking_id=$2`,
        ["disconnected", trackingId]
      );
    } catch (err) {
      console.error("Failed to persist disconnect:", err.message);
    }
  }
  return session;
}

export async function loadStore() {
  try {
    const linkRes = await pool.query(`SELECT * FROM tracking_links`);
    for (const row of linkRes.rows) {
      trackingLinks.set(row.token, fromLinkRow(row));
    }

    const sessionRes = await pool.query(`SELECT * FROM tracking_sessions`);
    for (const row of sessionRes.rows) {
      trackingHistory.set(row.tracking_id, fromSessionRow(row));
    }

    const pointRes = await pool.query(
      `SELECT tracking_id, latitude, longitude, accuracy, timestamp
       FROM tracking_points
       ORDER BY timestamp ASC`
    );
    for (const p of pointRes.rows) {
      const session = trackingHistory.get(p.tracking_id);
      if (session) {
        session.points.push({
          latitude: p.latitude,
          longitude: p.longitude,
          accuracy: p.accuracy,
          timestamp: Number(p.timestamp),
        });
      }
    }

    console.log(
      `DB loaded: ${trackingLinks.size} links, ${trackingHistory.size} sessions`
    );
  } catch (err) {
    console.error("Failed to load from DB:", err.message);
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL is not set. Run with DATABASE_URL set or keep memory-only mode.");
    }
  }
}

export function startExpirySweeper() {
  setInterval(() => {
    for (const [, link] of trackingLinks) {
      markExpiredIfDue(link);
    }
  }, 30000);
  console.log("Expiry sweeper started (30s interval)");
}