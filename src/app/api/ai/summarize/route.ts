import { NextRequest, NextResponse } from "next/server";
import { generateAIResponse } from "@/lib/ai/openrouter";
import { Pool } from "pg";

const pool = new Pool({
  user: process.env.PGUSER || "postgres",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  port: process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432,
});

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_summaries (
      id        SERIAL PRIMARY KEY,
      chat_id   VARCHAR(255) NOT NULL,
      summary   TEXT         NOT NULL,
      msg_count INT          DEFAULT 0,
      created_at TIMESTAMP   DEFAULT NOW(),
      updated_at TIMESTAMP   DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_chat_summaries_chat_id ON chat_summaries(chat_id);`);
  tableReady = true;
}

function truncateMessages(formatted: string[], maxChars = 4000): string {
  let result = "";
  for (let i = formatted.length - 1; i >= 0; i--) {
    const candidate = formatted[i] + "\n" + result;
    if (candidate.length > maxChars) break;
    result = candidate;
  }
  return result.trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chatId, limit = 50, forceRefresh = false } = body as {
      chatId: string;
      limit?: number;
      forceRefresh?: boolean;
    };

    if (!chatId || !chatId.includes("__")) {
      return NextResponse.json({ error: "Invalid chatId" }, { status: 400 });
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 10), 100);
    await ensureTable();

    const [userA, userB] = chatId.split("__");
    const msgRes = await pool.query<{ from_user: string; message: string; timestamp: string }>(
      `SELECT from_user, message, timestamp FROM messages
       WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)
       ORDER BY timestamp DESC LIMIT $3`,
      [userA, userB, safeLimit]
    );

    const rows = msgRes.rows.reverse();
    if (rows.length === 0) return NextResponse.json({ error: "No messages found" }, { status: 404 });

    if (!forceRefresh) {
      const cacheRes = await pool.query(
        `SELECT summary, msg_count, updated_at FROM chat_summaries WHERE chat_id = $1 ORDER BY updated_at DESC LIMIT 1`,
        [chatId]
      );
      if (cacheRes.rows.length > 0) {
        const cached = cacheRes.rows[0];
        if (rows.length - (cached.msg_count || 0) < 10) {
          return NextResponse.json({
            summary: cached.summary,
            cached: true,
            messageCount: rows.length,
            updatedAt: cached.updated_at,
          });
        }
      }
    }

    const formatted = rows.map((r) => `${r.from_user}: ${r.message}`);
    const conversationText = truncateMessages(formatted);

    const prompt = `Summarize the following conversation into clear, concise bullet points (max 5).
Focus on: Key decisions, Important info, and Action Items.
    
Conversation:
${conversationText}

Return ONLY bullet points. No markdown, no extra text.`;

    const summaryText = await generateAIResponse([
      { role: "system", content: "You are a specialized summarizer. Return only bullet points using • symbol." },
      { role: "user", content: prompt }
    ]);

    if (!summaryText) {
      return NextResponse.json({ error: "AI returned an empty summary." }, { status: 500 });
    }

    const existsRes = await pool.query("SELECT id FROM chat_summaries WHERE chat_id = $1", [chatId]);
    if (existsRes.rows.length > 0) {
      await pool.query(
        `UPDATE chat_summaries SET summary = $1, msg_count = $2, updated_at = NOW() WHERE chat_id = $3`,
        [summaryText, rows.length, chatId]
      );
    } else {
      await pool.query(
        `INSERT INTO chat_summaries (chat_id, summary, msg_count) VALUES ($1, $2, $3)`,
        [chatId, summaryText, rows.length]
      );
    }

    return NextResponse.json({
      summary: summaryText,
      cached: false,
      messageCount: rows.length,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Summarize API Error:", error);
    return NextResponse.json({ error: error.message || "Failed to generate summary." }, { status: 500 });
  }
}
