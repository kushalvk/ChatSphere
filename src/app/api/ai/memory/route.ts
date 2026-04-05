import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  user: process.env.PGUSER || "postgres",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  port: process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432,
});

// ─── GET /api/ai/memory?username=xxx ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "username query param required" }, { status: 400 });
  }
  try {
    const res = await pool.query(
      `SELECT id, content, category, created_at AS "createdAt"
       FROM memories WHERE username = $1
       ORDER BY created_at DESC LIMIT 20`,
      [username]
    );
    return NextResponse.json({ memories: res.rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── DELETE /api/ai/memory?id=xxx ────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const username = req.nextUrl.searchParams.get("username");
  if (!id || !username) {
    return NextResponse.json({ error: "id and username required" }, { status: 400 });
  }
  try {
    // Safety: only allow deleting your own memories
    await pool.query("DELETE FROM memories WHERE id = $1 AND username = $2", [id, username]);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
