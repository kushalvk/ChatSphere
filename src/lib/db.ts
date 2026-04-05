// src/lib/db.ts
import { Pool } from 'pg';

// Lazy singleton — Pool is only created at runtime (on first query),
// NOT at build time. This prevents "DATABASE_URL missing" build failures on Vercel.
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set. Add it to your Vercel Environment Variables and redeploy."
      );
    }

    // Strip sslmode from the URL — we handle SSL explicitly in the config below
    // to avoid conflicts between the connection string and the pg driver's ssl option.
    const connectionString = process.env.DATABASE_URL
      .replace(/[?&]sslmode=[^&]*/g, '')   // remove sslmode param
      .replace(/[?&]channel_binding=[^&]*/g, ''); // remove channel_binding param

    pool = new Pool({
      connectionString,
      // Always use SSL — both local dev and production connect to Neon (cloud),
      // which mandates SSL on all connections.
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

// Export a proxy so existing code (`pool.query(...)`) works without changes
const poolProxy = new Proxy({} as Pool, {
  get(_target, prop) {
    return (getPool() as any)[prop];
  },
});

export default poolProxy;


