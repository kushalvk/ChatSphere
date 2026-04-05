import { NextRequest, NextResponse } from "next/server";
import { generateAIJSONResponse } from "@/lib/ai/openrouter";
import { Pool } from "pg";

const pool = new Pool({
  user: process.env.PGUSER || "postgres",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  port: process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432,
});

interface MessagePayload {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, username } = (await req.json()) as {
      messages: MessagePayload[];
      username: string;
    };

    if (!messages?.length || !username) {
      return NextResponse.json({ error: "messages and username required" }, { status: 400 });
    }

    const memRes = await pool.query(
      `SELECT content, category FROM memories WHERE username = $1
       ORDER BY created_at DESC LIMIT 10`,
      [username]
    );
    const memories: { content: string; category: string }[] = memRes.rows;

    const memoryBlock =
      memories.length > 0
        ? memories.map((m) => `• [${m.category}] ${m.content}`).join("\n")
        : "No memories stored yet.";

    const conversationBlock = messages
      .slice(-10)
      .map((m) => `${m.role === "user" ? "User" : "Other"}: ${m.content}`)
      .join("\n");

    const prompt = `You are a personalized chat assistant.
User Memories:
${memoryBlock}

Recent conversation:
${conversationBlock}

Generate 3 personalized reply suggestions based on the user's memories.
Rules:
- Keep each reply under 20 words
- Return ONLY JSON array of strings: ["reply 1", "reply 2", "reply 3"]`;

    const parsed = await generateAIJSONResponse<string[]>([
      { role: "user", content: prompt }
    ]);

    if (!Array.isArray(parsed)) throw new Error("Unexpected response format");

    return NextResponse.json({
      replies: parsed.slice(0, 3),
      memoriesUsed: memories.length,
    });
  } catch (error: any) {
    console.error("Personalized Reply Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to generate reply." }, { status: 500 });
  }
}
