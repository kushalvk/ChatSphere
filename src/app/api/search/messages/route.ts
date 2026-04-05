import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Pool } from "pg";

// Reconfigure independent Postgres pipeline for standalone Next.js routes
const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  port: process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432,
});

const apiKey = process.env.GEMINI_API_KEY || "";
if (!apiKey) {
  console.error("GEMINI_API_KEY is missing from environment variables.");
}

const genAI = new GoogleGenerativeAI(apiKey.trim());
const model = genAI.getGenerativeModel({ model: "gemini-embedding-2-preview" });

export async function POST(req: NextRequest) {
  try {
    const { query, user, activeChat } = await req.json();

    if (!query || !user || !activeChat) {
      return NextResponse.json({ error: "Missing required fields: query, user, activeChat" }, { status: 400 });
    }

    // 1. Check if pgvector is supported by the database
    let useVectorQuery = true;
    try {
      await pool.query("SELECT '[]'::vector");
    } catch (e) {
      console.warn("pgvector not supported by database, falling back to keyword search.");
      useVectorQuery = false;
    }

    let sql = "";
    let params = [];
    let embeddingStr = "";

    // 2. If vector search is supported, generate embedding using Gemini
    if (useVectorQuery && apiKey) {
      try {
        const result = await model.embedContent(query);
        const embedding = result.embedding.values;
        // Convert embedding array to Postgres vector string format: [1.2, 3.4, ...]
        embeddingStr = `[${embedding.join(",")}]`;
      } catch (e) {
        console.error("Gemini Embedding Error:", e);
        useVectorQuery = false; // Fallback to safe keyword search if API fails
      }
    } else {
        useVectorQuery = false;
    }

    // 3. Construct and execute the query
    if (useVectorQuery) {
      sql = `
       SELECT id, from_user as "from", to_user as "to", message, timestamp, status,
       1 - (embedding <=> $1::vector) AS similarity
       FROM messages
       WHERE ((from_user = $2 AND to_user = $3) OR (from_user = $3 AND to_user = $2))
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT 10;
    `;
      params = [embeddingStr, user, activeChat];
    } else {
      // Safe keyword search fallback if pgvector or Gemini is missing/fails
      sql = `
       SELECT id, from_user as "from", to_user as "to", message, timestamp, status, 1.0 AS similarity
       FROM messages
       WHERE ((from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1))
         AND message ILIKE $3
       ORDER BY timestamp DESC 
       LIMIT 10;
    `;
      params = [user, activeChat, `%${query}%`];
    }

    const { rows } = await pool.query(sql, params);
    return NextResponse.json({ results: rows });

  } catch (error: any) {
    console.error("Search API Error:", error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
