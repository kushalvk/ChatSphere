import { NextRequest, NextResponse } from "next/server";
import { generateAIResponse } from "@/lib/ai/openrouter";
import pool from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { chatId, query, username } = await req.json();

    if (!chatId || !query || !username) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Fetch Context: Recent (30) + Important (20) + Semantically Relevant (10)
    // 1a. Recent
    const recentRes = await pool.query(
      `SELECT from_user, message, timestamp FROM messages 
       WHERE ((from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1))
         AND is_deleted = FALSE 
       ORDER BY timestamp DESC LIMIT 30`,
      [username, chatId]
    );

    // 1b. Important
    const importantRes = await pool.query(
      `SELECT from_user, message, timestamp FROM messages 
       WHERE ((from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1))
         AND is_important = TRUE AND is_deleted = FALSE 
       ORDER BY timestamp DESC LIMIT 20`,
      [username, chatId]
    );

    // 1c. Relevant (Semantic Search via Embeddings)
    let relevantRows: any[] = [];
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (apiKey) {
      try {
        // First check if 'vector' type exists in DB
        const vectorCheck = await pool.query("SELECT typname FROM pg_type WHERE typname = 'vector'").catch(() => ({ rows: [] }));
        const hasVector = vectorCheck.rows.length > 0;

        if (hasVector) {
          const { GoogleGenerativeAI } = require("@google/generative-ai");
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({ model: "gemini-embedding-2-preview" });
          const result = await model.embedContent(query);
          const embeddingStr = `[${result.embedding.values.join(",")}]`;
          
          const relevantRes = await pool.query(
            `SELECT from_user, message, timestamp FROM messages 
             WHERE ((from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1))
               AND embedding IS NOT NULL AND is_deleted = FALSE
             ORDER BY embedding <=> $3::vector LIMIT 10`,
            [username, chatId, embeddingStr]
          );
          relevantRows = relevantRes.rows;
        } else {
          // Fallback to keyword search if vector is missing
          const kwRes = await pool.query(
            `SELECT from_user, message, timestamp FROM messages 
             WHERE ((from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1))
               AND message ILIKE $3 AND is_deleted = FALSE
             ORDER BY timestamp DESC LIMIT 10`,
            [username, chatId, `%${query}%`]
          );
          relevantRows = kwRes.rows;
        }
      } catch (e) { 
        console.error("Semantic fallback in context AI failed:", e); 
      }
    }

    // Combine and Deduplicate
    const combined = [...recentRes.rows, ...importantRes.rows, ...relevantRows];
    const uniqueMessages = Array.from(new Map(combined.map(m => [m.timestamp.getTime() + m.message, m])).values());
    uniqueMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const formattedMessages = uniqueMessages.map(m => `${m.from_user}: ${m.message}`).join("\n");

    const promptText = `You are an AI assistant analyzing a chat conversation.

Conversation:
${formattedMessages}

Question:
${query}

Instructions:
* Understand the discussion between the participants.
* Identify decisions, tasks, agreements, and key information.
* Answer clearly and concisely.
* Mention names when relevant.
* Do not hallucinate.

Return ONLY the answer. No explanation.`;

    const answer = await generateAIResponse([
      { role: "user", content: promptText }
    ]);

    return NextResponse.json({ answer: answer.trim() || "I couldn't find enough context to answer that." });

  } catch (error: any) {
    console.error("Group Context AI Error:", error);
    return NextResponse.json({ error: "Failed to process context" }, { status: 500 });
  }
}
