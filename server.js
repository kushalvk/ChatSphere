const { createServer } = require("http");
const { Server } = require("socket.io");
const { Pool } = require("pg");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

// AI Provider Configs
const geminiApiKey = process.env.GEMINI_API_KEY;
const openRouterKey = process.env.OPENROUTER_API_KEY;

// Keep Gemini instance strictly for Legacy Embeddings
const genAI = (geminiApiKey && geminiApiKey !== "your_gemini_api_key_here") ? new GoogleGenerativeAI(geminiApiKey) : null;

// Helper for OpenRouter (Nemotron-3-Super)
async function openRouterRequest(prompt) {
  if (!openRouterKey || openRouterKey === "your_openrouter_api_key_here") return null;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-3-super-120b-a12b:free",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1, // Lower temperature for more consistent JSON
      }),
    });
    const data = await res.json();
    let content = data.choices?.[0]?.message?.content || "";
    
    // Clean JSON from potential markdown/chatty text
    content = content.trim();
    if (content.includes("```")) {
      content = content.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "").trim();
    }
    // Deep fallback if leading text exists: find first '{' and last '}'
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      const jsonContent = content.substring(startIdx, endIdx + 1);
      try {
        return JSON.parse(jsonContent);
      } catch (e) {
        return content; // Fallback to raw string if substring isn't valid JSON
      }
    }
    return content; // Return raw string if no curly braces found
  } catch (e) {
    console.error("OpenRouter Request Failed:", e.message);
    return null;
  }
}


// Background semantic generator
async function generateEmbedding(text) {
  if (!genAI) return null;
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-2-preview" });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error("Embedding fail via 004 generation fallback bypassed:", error.message);
    return null;
  }
}

// ─── AI Message Classifier (async, non-blocking) ──────────────────────────────
const CLASSIFICATION_FALLBACK = { isImportant: false, msgType: 'normal', confidence: 0 };
const VALID_TYPES = ['deadline', 'decision', 'task', 'alert', 'payment', 'normal'];
// Simple in-memory cache to avoid redundant API calls for identical messages
const classifyCache = new Map();

async function classifyMessage(text) {
  if (!openRouterKey || !text || text.trim().length < 5) return CLASSIFICATION_FALLBACK;

  const cacheKey = text.trim().toLowerCase();
  if (classifyCache.has(cacheKey)) return classifyCache.get(cacheKey);

  try {
    const prompt = `Analyze the following chat message and classify its intent and importance.
Message: "${text.trim()}"

Return ONLY valid JSON (no intro, no markdown):
{
  "isImportant": boolean,
  "type": "deadline" | "decision" | "task" | "alert" | "payment" | "normal",
  "confidence": number
}

Rules:
- deadline: time limits/urgency ("by tomorrow", "due at 5pm")
- decision: conclusions ("we will use", "decided", "approved")
- task: action items ("please fix", "you need to", "can you handle")
- alert: warnings ("server down", "urgent", "security issue")
- payment: financial ("paid", "invoice", "payment done")
- normal: casual, greetings
- isImportant: true if type is NOT normal
- confidence: 0.0-1.0`;

    const parsed = await openRouterRequest(prompt);
    if (!parsed) return CLASSIFICATION_FALLBACK;

    const classification = {
      isImportant: Boolean(parsed.isImportant),
      msgType: VALID_TYPES.includes(parsed.type) ? parsed.type : 'normal',
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
    };

    // Cache up to 500 unique messages; evict oldest when full
    if (classifyCache.size >= 500) {
      classifyCache.delete(classifyCache.keys().next().value);
    }
    classifyCache.set(cacheKey, classification);
    return classification;
  } catch (err) {
    console.error('Classification error (non-fatal):', err.message);
    return CLASSIFICATION_FALLBACK;
  }
}

// ─── AI Emotion Detector (async, non-blocking) ──────────────────────────────
const EMOTION_FALLBACK = { emotion: 'neutral', sentiment: 'neutral', emotionConfidence: 0 };
const VALID_EMOTIONS = ['happy', 'sad', 'angry', 'frustrated', 'neutral', 'excited'];
const VALID_SENTIMENTS = ['positive', 'negative', 'neutral'];
const emotionCache = new Map();

async function detectEmotion(text) {
  if (!openRouterKey || !text) return EMOTION_FALLBACK;
  const words = text.trim().split(/\s+/);
  if (words.length < 4) return EMOTION_FALLBACK;

  const cacheKey = text.trim().toLowerCase();
  if (emotionCache.has(cacheKey)) return emotionCache.get(cacheKey);

  try {
    const prompt = `Analyze the emotional tone of this message: "${text.trim()}"

Return ONLY valid JSON:
{
  "emotion": "happy" | "sad" | "angry" | "frustrated" | "neutral" | "excited",
  "sentiment": "positive" | "negative" | "neutral",
  "confidence": number
}

Rules:
- emotion must be exactly one of the six listed
- sentiment: happy/excited→positive, sad/angry/frustrated→negative, neutral→neutral
- Strictly JSON only.`;

    const parsed = await openRouterRequest(prompt);
    if (!parsed) return EMOTION_FALLBACK;

    const emotion = {
      emotion: VALID_EMOTIONS.includes(parsed.emotion) ? parsed.emotion : 'neutral',
      sentiment: VALID_SENTIMENTS.includes(parsed.sentiment) ? parsed.sentiment : 'neutral',
      emotionConfidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
    };

    if (emotionCache.size >= 500) emotionCache.delete(emotionCache.keys().next().value);
    emotionCache.set(cacheKey, emotion);
    return emotion;
  } catch (err) {
    console.error('Emotion detection error (non-fatal):', err.message);
    return EMOTION_FALLBACK;
  }
}

// ─── AI Memory Extractor (async, non-blocking) ───────────────────────────
const MEMORY_FALLBACK = { shouldStore: false, memory: '', category: 'other' };
const VALID_MEMORY_CATS = ['preference', 'goal', 'personal', 'other'];

async function extractMemory(text) {
  if (!openRouterKey || !text || text.trim().split(/\s+/).length < 3) return MEMORY_FALLBACK;
  try {
    const prompt = `Extract useful long-term personal facts from this message: "${text.trim()}"

Return ONLY valid JSON:
{
  "shouldStore": boolean,
  "memory": "short descriptive sentence in 3rd person",
  "category": "preference" | "goal" | "personal" | "other"
}

Rules:
- shouldStore: true only for meaningful facts about the user (likes, jobs, goals)
- Ignore casual small talk or questions.
- Strictly JSON only.`;

    const parsed = await openRouterRequest(prompt);
    if (!parsed) return MEMORY_FALLBACK;

    return {
      shouldStore: Boolean(parsed.shouldStore),
      memory: String(parsed.memory || '').trim().slice(0, 200),
      category: VALID_MEMORY_CATS.includes(parsed.category) ? parsed.category : 'other',
    };
  } catch (err) {
    console.error('Memory extraction error (non-fatal):', err.message);
    return MEMORY_FALLBACK;
  }
}

// PostgreSQL Database Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Recommended: Single string vs individual vars
  ssl: { rejectUnauthorized: false } // Required for Cloud DBs like Neon
});

async function initDb() {
  try {
    // Inject PgVector Extension to PostgreSQL environment (requires NeonDB/supported pg architecture)
    try { await pool.query("CREATE EXTENSION IF NOT EXISTS vector"); }
    catch (e) { console.log('PGVector missing or bypassed:', e.message); }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255),
        phone VARCHAR(20),
        status VARCHAR(20) DEFAULT 'offline'
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        from_user VARCHAR(100),
        to_user VARCHAR(100),
        message TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'sent'
      );
    `);

    // Non-blocking schema addition for historical compatibility
    try { await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS embedding vector(768);'); } catch (e) { }

    // Index creation to radically speed up nearest neighbor distance querying (ivfflat)
    try { await pool.query('CREATE INDEX IF NOT EXISTS msg_embed_idx ON messages USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);'); } catch (e) { }

    // AI Smart Highlight columns
    // AI Smart Highlight columns
    try { await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_important BOOLEAN DEFAULT FALSE;'); } catch (e) { }
    try { await pool.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS msg_type VARCHAR(20) DEFAULT 'normal';"); } catch (e) { }
    try { await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS confidence FLOAT DEFAULT 0;'); } catch (e) { }

    // AI Emotion Detection columns
    try { await pool.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS emotion VARCHAR(20) DEFAULT 'neutral';"); } catch (e) { }
    try { await pool.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS sentiment VARCHAR(20) DEFAULT 'neutral';"); } catch (e) { }
    try { await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS emotion_confidence FLOAT DEFAULT 0;'); } catch (e) { }

    // Translations + Language columns
    try { await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en';"); } catch (e) { }
    try { await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS translated TEXT;'); } catch (e) { }
    try { await pool.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS language VARCHAR(10);"); } catch (e) { }

    // OTP Verification columns
    try { await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;'); } catch (e) { }
    try { await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS otp VARCHAR(10);'); } catch (e) { }
    try { await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expiry TIMESTAMP;'); } catch (e) { }


    // AI Memory table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id        SERIAL PRIMARY KEY,
        username  VARCHAR(100) NOT NULL,
        content   TEXT        NOT NULL,
        category  VARCHAR(30)  DEFAULT 'other',
        created_at TIMESTAMP  DEFAULT NOW()
      );
    `);
    try { await pool.query('CREATE INDEX IF NOT EXISTS idx_memories_username ON memories(username);'); } catch(e) {}

    // Edit/Delete flags
    try { await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;'); } catch (e) { }
    try { await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;'); } catch (e) { }
    try { await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_ai BOOLEAN DEFAULT FALSE;'); } catch (e) { }

    // Chat Status for soft delete per user
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_user_status (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        chat_partner VARCHAR(100) NOT NULL,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(username, chat_partner)
      );
    `);

    console.log("PostgreSQL Database (with PGVector mappings) initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize PostgreSQL DB:", err);
    process.exit(1);
  }
}
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let onlineUsers = {}; // username -> socket.id

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Register user, load history, set online state
  socket.on("register", async (data) => {
    const { username, phone } = typeof data === 'string' ? { username: data, phone: '' } : data;

    onlineUsers[username] = socket.id;
    socket.username = username;
    console.log(`${username} is online`);

    try {
      // Upsert user into PostgreSQL
      await pool.query(
        `INSERT INTO users (username, phone) VALUES ($1, $2) 
         ON CONFLICT (username) DO UPDATE SET phone=EXCLUDED.phone`,
        [username, phone]
      );

      // 1. Fetch user language
      const userRes = await pool.query("SELECT language FROM users WHERE username = $1", [username]);
      const userLang = userRes.rows[0]?.language || 'en';

      // 2. Clear previous history and fetch fresh
      // Rule: Don't fetch messages if the chat was 'deleted' for this user AND the message was sent before 'deleted_at'
      // Also respect global 'is_deleted'
      const historyRes = await pool.query(
        `SELECT m.id, m.from_user as "from", m.to_user as "to", m.message, m.timestamp, m.status,
                m.is_important as "isImportant", m.msg_type as "msgType", m.confidence,
                m.emotion, m.sentiment, m.emotion_confidence as "emotionConfidence",
                m.translated, m.language, m.is_deleted as "isDeleted", m.is_edited as "isEdited",
                m.is_ai as "isAI"
         FROM messages m
         LEFT JOIN chat_user_status cus 
           ON (cus.username = $1 AND cus.chat_partner = CASE WHEN m.from_user = $1 THEN m.to_user ELSE m.from_user END)
         WHERE (m.from_user = $1 OR m.to_user = $1)
           AND (cus.is_deleted IS NULL OR cus.is_deleted = FALSE OR m.timestamp > cus.deleted_at)
         ORDER BY m.timestamp ASC`,
        [username]
      );

      socket.emit("chat_history", historyRes.rows);
      socket.emit("user_language", userLang);


      // Tell other online contacts this user is online (WhatsApp 'online' feature)
      socket.broadcast.emit("user_online_status", { username, isOnline: true });

    } catch (err) {
      console.error("DB Error on register:", err);
    }
  });

  // Check if user exists before starting a chat
  socket.on("check_user", async (targetUsername) => {
    try {
      const result = await pool.query("SELECT username FROM users WHERE username = $1", [targetUsername]);
      socket.emit("check_user_result", {
        username: targetUsername,
        exists: result.rows.length > 0
      });
    } catch (err) {
      console.error("DB Error on check_user:", err);
    }
  });

  // Handle incoming messages
  socket.on("send_message", async (data) => {
    const { id: tempId, from, to, message, timestamp } = data;
    console.log(`Message from ${from} to ${to}: ${message}`);

    const recipientSocketId = onlineUsers[to];
    const finalStatus = recipientSocketId ? 'delivered' : 'sent';

    try {
      // Get recipient language preference
      const recipientRes = await pool.query("SELECT language FROM users WHERE username = $1", [to]);
      const recipientLang = recipientRes.rows[0]?.language || 'en';

      const res = await pool.query(
        "INSERT INTO messages (from_user, to_user, message, timestamp, status) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [from, to, message, timestamp, finalStatus]
      );

      const dbId = res.rows[0].id;
      let broadcastData = { ...data, id: dbId, tempId: tempId, status: finalStatus };
      
      // Emit immediately to sender
      io.to(socket.id).emit("receive_message", broadcastData);

      // ── Background pipeline (non-blocking, never delays message delivery) ──
      (async () => {
        // 1. Language Detection & Translation
        let senderLang = 'en';
        let translatedText = null;

        if (openRouterKey && openRouterKey !== 'your_openrouter_api_key_here') {
          // Detect sender language
          const detectionPrompt = `Detect the language of the following text. Return ONLY the ISO 639-1 code (e.g., 'en', 'hi', 'es').\n\nText: "${message.substring(0, 100).trim()}"`;
          const detectedCode = await openRouterRequest(detectionPrompt);
          senderLang = (typeof detectedCode === 'string' ? detectedCode.trim().toLowerCase() : (detectedCode?.language || 'en')).substring(0, 5);

          // Update DB with detected language
          await pool.query("UPDATE messages SET language = $1 WHERE id = $2", [senderLang, dbId]).catch(e => {});

          // If recipient language is different, translate
          if (senderLang !== recipientLang) {
            const translationPrompt = `Translate the following text into the language with ISO code '${recipientLang}'. Return ONLY the translated text.\n\nText: ${message}`;
            // Use same openRouterRequest but we need literal text back, not JSON usually?
            // Wait, openRouterRequest in server.js tries to JSON.parse(content).
            // I should add a literal request helper or adjust it.
            
            const rawTranslationRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${openRouterKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "nvidia/nemotron-3-super-120b-a12b:free",
                messages: [
                  { role: "system", content: "You are a professional translation engine. Return ONLY the translated text." },
                  { role: "user", content: `Translate this into ${recipientLang}: ${message}` }
                ],
                temperature: 0.1,
              }),
            });
            const transData = await rawTranslationRes.json();
            translatedText = transData.choices?.[0]?.message?.content?.trim() || null;
            
            if (translatedText) {
              await pool.query("UPDATE messages SET translated = $1 WHERE id = $2", [translatedText, dbId]).catch(e => {});
              // Broadcast translation update
              const transPayload = { id: String(dbId), translated: translatedText, language: senderLang };
              if (recipientSocketId) {
                io.to([socket.id, recipientSocketId]).emit('message_translated', transPayload);
              } else {
                io.to(socket.id).emit('message_translated', transPayload);
              }
            }
          }
        }

        // 2. Delivery to recipient (if online) with potential translation
        if (recipientSocketId) {
          const finalData = { ...broadcastData, translated: translatedText, language: senderLang };
          io.to(recipientSocketId).emit("receive_message", finalData);
        }

        // 3. Embedding for semantic search
        const arr = await generateEmbedding(message);
        if (arr) {
          const vectorStr = `[${arr.join(",")}]`;
          await pool.query("UPDATE messages SET embedding = $1::vector WHERE id = $2", [vectorStr, dbId]).catch(e => console.log('Vector Update Skips...'));
        }

        // 4. AI Smart Highlight classification
        if (openRouterKey && openRouterKey !== 'your_openrouter_api_key_here') {
          const classification = await classifyMessage(message);

          // Persist to DB
          await pool.query(
            `UPDATE messages SET is_important=$1, msg_type=$2, confidence=$3 WHERE id=$4`,
            [classification.isImportant, classification.msgType, classification.confidence, dbId]
          ).catch(e => console.error('Classify DB update error:', e.message));

          // Broadcast to both participants so UI updates in real-time
          const classifyPayload = { id: String(dbId), ...classification };
          if (recipientSocketId) {
            io.to([socket.id, recipientSocketId]).emit('message_classified', classifyPayload);
          } else {
            io.to(socket.id).emit('message_classified', classifyPayload);
          }
        }


        // 3. AI Emotion Detection
        if (openRouterKey && openRouterKey !== 'your_openrouter_api_key_here') {
          const emotionData = await detectEmotion(message);

          // Persist to DB
          await pool.query(
            `UPDATE messages SET emotion=$1, sentiment=$2, emotion_confidence=$3 WHERE id=$4`,
            [emotionData.emotion, emotionData.sentiment, emotionData.emotionConfidence, dbId]
          ).catch(e => console.error('Emotion DB update error:', e.message));

          // Broadcast real-time emotion update to both participants
          const emotionPayload = { id: String(dbId), ...emotionData };
          if (recipientSocketId) {
            io.to([socket.id, recipientSocketId]).emit('message_emotion', emotionPayload);
          } else {
            io.to(socket.id).emit('message_emotion', emotionPayload);
          }
        }

        // 4. AI Memory Extraction (only from the sender's own messages)
        if (openRouterKey && openRouterKey !== 'your_openrouter_api_key_here') {
          const mem = await extractMemory(message);
          if (mem.shouldStore && mem.memory) {
            // Dedup: skip if identical memory already exists for this user
            const existing = await pool.query(
              'SELECT id FROM memories WHERE username=$1 AND content=$2 LIMIT 1',
              [from, mem.memory]
            );
            if (existing.rows.length === 0) {
              // Keep only latest 20 memories per user (sliding window)
              await pool.query(
                `DELETE FROM memories WHERE username=$1 AND id IN (
                   SELECT id FROM memories WHERE username=$1
                   ORDER BY created_at DESC OFFSET 19
                )`,
                [from]
              ).catch(() => {});
              await pool.query(
                'INSERT INTO memories (username, content, category) VALUES ($1, $2, $3)',
                [from, mem.memory, mem.category]
              );
              console.log(`[Memory] Stored for ${from}: "${mem.memory}" [${mem.category}]`);
            }
          }
        }
      })();
      
      // ── AI Assistant (Copilot Mode - @ai trigger & Slash Commands) ──
      const lowerMsg = message.trim().toLowerCase();
      if (lowerMsg.startsWith("@ai") || lowerMsg.startsWith("/summarize") || lowerMsg.startsWith("/translate")) {
        (async () => {
          let query = "";
          let prompt = "";

          if (lowerMsg.startsWith("/summarize")) {
            const contextRes = await pool.query(
              `SELECT from_user, message FROM messages 
               WHERE ((from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1))
                 AND is_deleted = FALSE ORDER BY timestamp DESC LIMIT 30`,
              [from, to]
            );
            const contextMsgs = contextRes.rows.reverse().map(r => `${r.from_user}: ${r.message}`).join("\n");
            prompt = `Summarize the following chat conversation concisely:\n\n${contextMsgs}\n\nReturn ONLY the summary.`;
          } else if (lowerMsg.startsWith("/translate")) {
            const parts = message.split(" ");
            const targetLang = parts[1] || "English";
            const textToTranslate = parts.slice(2).join(" ") || "No text provided.";
            prompt = `Translate the following text to ${targetLang}:\n\n"${textToTranslate}"\n\nReturn ONLY the translated text.`;
          } else {
            query = message.split(" ").slice(1).join(" ");
            if (!query.trim()) return;

            const contextRes = await pool.query(
              `SELECT from_user, message FROM messages 
               WHERE ((from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1))
                 AND is_deleted = FALSE 
               ORDER BY timestamp DESC LIMIT 10`,
              [from, to]
            );
            const contextMsgs = contextRes.rows.reverse().map(r => `${r.from_user}: ${r.message}`).join("\n");

            const memoryRes = await pool.query(
              'SELECT content FROM memories WHERE username = $1 ORDER BY created_at DESC LIMIT 5',
              [from]
            );
            const userMemories = memoryRes.rows.map(r => r.content).join(", ");

            prompt = `You are an intelligent AI assistant inside a chat application.

User query: "${query}"

Conversation context:
${contextMsgs}

User memory:
${userMemories}

Instructions:
* Be helpful and accurate.
* Use context if relevant.
* Keep response concise.
* Mention names when relevant.
* Do not hallucinate.

Return ONLY the answer. No explanation.`;
          }

          try {
            const aiResponseText = await openRouterRequest(prompt);
            if (aiResponseText) {
              const aiMsgRes = await pool.query(
                "INSERT INTO messages (from_user, to_user, message, timestamp, status, is_ai) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
                ["AI Assistant", from, aiResponseText, new Date().toISOString(), 'sent', true]
              );
              
              const aiDbId = aiMsgRes.rows[0].id;
              const aiPayload = {
                id: aiDbId,
                from: "AI Assistant",
                to: from,
                message: aiResponseText,
                timestamp: new Date().toISOString(),
                status: 'sent',
                isAI: true
              };

              // Personal AI: ONLY emit to the sender
              io.to(socket.id).emit("receive_message", aiPayload);
            }
          } catch (err) {
            console.error("AI Assistant Error:", err);
          }
        })();
      } else if (to === "AI Assistant") {
        // Direct private chat with AI
        (async () => {
          try {
             // Fetch context from the private AI-user thread
             const contextRes = await pool.query(
                `SELECT from_user, message FROM messages 
                 WHERE ((from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1))
                   AND is_deleted = FALSE ORDER BY timestamp DESC LIMIT 10`,
                [from, "AI Assistant"]
             );
             const contextMsgs = contextRes.rows.reverse().map(r => `${r.from_user}: ${r.message}`).join("\n");
             
             const prompt = `You are a private AI Assistant helper.
Conversation History:
${contextMsgs}

Latest Message: "${message}"

Help the user directly. Keep it concise. Return ONLY the answer.`;
             
             const aiResponseText = await openRouterRequest(prompt);
             if (aiResponseText) {
                const aiMsgRes = await pool.query(
                  "INSERT INTO messages (from_user, to_user, message, timestamp, status, is_ai) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
                  ["AI Assistant", from, aiResponseText, new Date().toISOString(), 'sent', true]
                );
                
                io.to(socket.id).emit("receive_message", {
                  id: aiMsgRes.rows[0].id,
                  from: "AI Assistant",
                  to: from,
                  message: aiResponseText,
                  timestamp: new Date().toISOString(),
                  status: 'sent',
                  isAI: true
                });
             }
          } catch (e) { console.error("Direct AI Chat error:", e); }
        })();
      }
    } catch (err) {
      console.error("Failed to insert message:", err);
      data.status = "failed";
      io.to(socket.id).emit("receive_message", data);
    }
  });

  // Mark all unread messages from a specific sender to this user as 'read'
  socket.on("mark_read", async ({ fromUser, toUser }) => {
    try {
      // Find all delivered/sent messages from "fromUser" to "toUser"
      const result = await pool.query(
        `UPDATE messages SET status='read' 
         WHERE from_user = $1 AND to_user = $2 AND status != 'read'
         RETURNING id`,
        [fromUser, toUser]
      );

      // If sender is currently online, send them blue ticks
      const senderSocketId = onlineUsers[fromUser];
      if (senderSocketId && result.rows.length > 0) {
        const readIds = result.rows.map(row => row.id);
        io.to(senderSocketId).emit("messages_read", readIds);
      }
    } catch (err) {
      console.error("DB Error marking read:", err);
    }
  });

  // Propagate "typing..." indicators
  socket.on("typing", (data) => {
    const { to, isTyping } = data;
    const recipientSocketId = onlineUsers[to];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("typing_status", {
        from: socket.username,
        isTyping
      });
    }
  });

  // Update user's language preference
  socket.on("update_language", async (newLang) => {
    if (!socket.username || !newLang) return;
    try {
      await pool.query("UPDATE users SET language = $1 WHERE username = $2", [newLang, socket.username]);
      socket.emit("user_language", newLang);
      console.log(`Language updated to ${newLang} for ${socket.username}`);
    } catch (err) {
      console.error("DB Error updating language:", err);
    }
  });

  // Delete a message (soft delete)
  socket.on("delete_message", async ({ id, from }) => {
    if (socket.username !== from) return; // Auth check
    try {
      await pool.query(
        "UPDATE messages SET message = 'This message was deleted', is_deleted = TRUE WHERE id = $1 AND from_user = $2",
        [id, from]
      );
      
      // Notify both participants
      const msgRes = await pool.query("SELECT from_user, to_user FROM messages WHERE id = $1", [id]);
      if (msgRes.rows.length > 0) {
        const { from_user, to_user } = msgRes.rows[0];
        const resps = [onlineUsers[from_user], onlineUsers[to_user]].filter(Boolean);
        io.to(resps).emit("message_deleted", { messageId: id, from: from_user, to: to_user });
      }
    } catch (err) {
      console.error("Delete message error:", err);
    }
  });

  // Edit a message
  socket.on("edit_message", async ({ id, from, newContent }) => {
    if (socket.username !== from || !newContent.trim()) return;
    try {
      await pool.query(
        "UPDATE messages SET message = $1, is_edited = TRUE WHERE id = $2 AND from_user = $3 AND is_deleted = FALSE",
        [newContent, id, from]
      );
      
      const msgRes = await pool.query("SELECT from_user, to_user FROM messages WHERE id = $1", [id]);
      if (msgRes.rows.length > 0) {
        const { from_user, to_user } = msgRes.rows[0];
        const resps = [onlineUsers[from_user], onlineUsers[to_user]].filter(Boolean);
        io.to(resps).emit("message_updated", { messageId: id, newContent, isEdited: true });
      }
    } catch (err) {
      console.error("Edit message error:", err);
    }
  });

  // Delete entire chat for a specific user (soft delete for that user)
  socket.on("delete_chat", async ({ username, chatPartner }) => {
    if (socket.username !== username) return;
    try {
      await pool.query(
        `INSERT INTO chat_user_status (username, chat_partner, is_deleted, deleted_at)
         VALUES ($1, $2, TRUE, NOW())
         ON CONFLICT (username, chat_partner) DO UPDATE SET is_deleted = TRUE, deleted_at = NOW()`,
        [username, chatPartner]
      );
      socket.emit("chat_deleted", { chatPartner });
    } catch (err) {
      console.error("Delete chat error:", err);
    }
  });

  socket.on("disconnect", () => {

    console.log(`User disconnected: ${socket.id}`);
    if (socket.username) {
      delete onlineUsers[socket.username];
      socket.broadcast.emit("user_online_status", { username: socket.username, isOnline: false });
    }
  });
});

const PORT = 3001;
initDb().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Socket.io server running at http://localhost:${PORT}`);
  });
}).catch(console.error);
