import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("render.com")
    ? { rejectUnauthorized: false }
    : false,
});

pool.on("error", (err) => {
  console.error("PostgreSQL pool error:", err.message);
});

export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tracking_links (
        token TEXT PRIMARY KEY,
        tracking_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL DEFAULT 'Unnamed Tracking',
        status TEXT NOT NULL DEFAULT 'active',
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        use_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS tracking_sessions (
        tracking_id TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT 'Unnamed Tracking',
        status TEXT NOT NULL DEFAULT 'active',
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        stopped_at BIGINT,
        stop_reason TEXT,
        last_seen_at BIGINT
      );

      CREATE TABLE IF NOT EXISTS tracking_points (
        id SERIAL PRIMARY KEY,
        tracking_id TEXT NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        accuracy DOUBLE PRECISION,
        timestamp BIGINT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_points_tracking_id
        ON tracking_points(tracking_id);
    `);
    console.log("PostgreSQL tables ready");
  } finally {
    client.release();
  }
}

export default pool;