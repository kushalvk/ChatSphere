// src/lib/db.ts
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error("CRITICAL: DATABASE_URL is missing! Make sure to set it in your Vercel Environment Variables.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default pool;
