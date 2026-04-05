export async function generateAIResponse(messages: { role: string; content: string }[]) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set in environment variables.");
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/Antigravity-AI", // OpenRouter recommendation
      "X-Title": "ChatShere1 AI Assistant",
    },
    body: JSON.stringify({
      model: "nvidia/nemotron-3-super-120b-a12b:free",
      messages,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`OpenRouter API Error [${res.status}]:`, errorBody);
    throw new Error(`OpenRouter API returned ${res.status}: ${errorBody}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  console.log("[OpenRouter] Raw response:", content.substring(0, 200));
  return content;
}

/**
 * Specifically for JSON-returning prompts.
 * Nemotron can sometimes be chatty, so we'll clean and parse.
 */
export async function generateAIJSONResponse<T>(messages: { role: string; content: string }[]): Promise<T | null> {
  const content = await generateAIResponse(messages);
  if (!content) return null;

  try {
    // Clean potential markdown code fences
    let clean = content.trim();
    if (clean.includes("```")) {
      clean = clean.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "").trim();
    }
    // Find the first JSON structure — either an array '[' or object '{'
    const firstBracket = clean.indexOf('[');
    const firstBrace = clean.indexOf('{');
    let startIdx = -1;
    let endChar = '';
    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
      startIdx = firstBracket;
      endChar = ']';
    } else if (firstBrace !== -1) {
      startIdx = firstBrace;
      endChar = '}';
    }
    if (startIdx !== -1) {
      const endIdx = clean.lastIndexOf(endChar);
      if (endIdx !== -1) clean = clean.substring(startIdx, endIdx + 1);
    }

    return JSON.parse(clean) as T;
  } catch (err) {
    console.error("JSON Parse Error on OpenRouter response:", err);
    console.log("Raw content was:", content);
    return null;
  }
}
