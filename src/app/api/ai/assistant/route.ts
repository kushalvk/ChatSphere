import { NextRequest, NextResponse } from "next/server";
import { generateAIResponse } from "@/lib/ai/openrouter";
import pool from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { chatId, userId, query, contextMessages } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    // 1. Fetch relevant memories for the user
    let userMemories = "";
    if (userId) {
      const memoryRes = await pool.query(
        'SELECT content FROM memories WHERE username = $1 ORDER BY created_at DESC LIMIT 5',
        [userId]
      );
      userMemories = memoryRes.rows.map(r => r.content).join(", ");
    }

    // 2. Format context messages
    const formattedContext = (contextMessages || []).map((m: any) => `${m.from}: ${m.message}`).join("\n");

    const promptText = `You are an intelligent AI assistant inside a chat application.

User query: "${query}"

Conversation context:
${formattedContext}

User memory:
${userMemories}

Instructions:
* Be helpful and accurate.
* Use context if relevant.
* Keep response concise.
* Mention names when relevant.
* Do not hallucinate.

Return ONLY the answer. No explanation.`;

    const answer = await generateAIResponse([
      { role: "user", content: promptText }
    ]);

    return NextResponse.json({ response: answer.trim() });

  } catch (error: any) {
    console.error("AI Assistant Error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
