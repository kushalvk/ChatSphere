import { NextRequest, NextResponse } from "next/server";
import { generateAIResponse } from "@/lib/ai/openrouter";

export async function POST(req: NextRequest) {
  try {
    const { partialMessage, conversation } = await req.json();

    if (!partialMessage || typeof partialMessage !== "string") {
      return NextResponse.json({ error: "Missing partialMessage" }, { status: 400 });
    }

    // Skip if input is too short
    if (partialMessage.trim().length < 5) {
      return NextResponse.json({ completion: "" });
    }

    const recentConversation = (conversation || []).slice(-5);
    const contextText = recentConversation
      .map((m: any) => `${m.role === 'user' ? 'Me' : 'Them'}: ${m.content}`)
      .join("\n");

    const promptText = `You are an AI writing assistant.

Complete the following message naturally and concisely.

Conversation context:
${contextText}

Partial message:
${partialMessage}

Rules:
* Continue the sentence
* Do not repeat input
* Keep under 12 words
* Return ONLY completion text. No explanation.`;

    const completion = await generateAIResponse([
      { role: "user", content: promptText }
    ]);

    // Clean up response: sometimes AI includes the partial message or quotes
    let cleanCompletion = completion.trim();
    if (cleanCompletion.toLowerCase().startsWith(partialMessage.toLowerCase())) {
        cleanCompletion = cleanCompletion.substring(partialMessage.length).trim();
    }
    
    // Remote any leading quotes or extra fluff
    cleanCompletion = cleanCompletion.replace(/^["' \.]+|["' ]+$/g, '');
    
    // If it's starting with a prefix that makes it a separate sentence, we might want to keep it
    // but the rule was to "Continue the sentence".

    return NextResponse.json({ completion: cleanCompletion });

  } catch (error: any) {
    console.error("Predict Error:", error);
    return NextResponse.json({ error: "Failed to fetch prediction" }, { status: 500 });
  }
}
