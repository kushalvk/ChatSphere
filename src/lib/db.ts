// src/lib/db.ts
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Recommended: Single string vs individual vars
  ssl: { rejectUnauthorized: false } // Required for Cloud DBs like Neon
});

export default pool;
