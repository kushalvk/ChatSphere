import { NextRequest, NextResponse } from "next/server";
import { generateAIJSONResponse } from "@/lib/ai/openrouter";

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Invalid or empty messages payload" }, { status: 400 });
    }

    const recentMessages = messages.slice(-10);
    const conversationText = recentMessages
      .map((m: any) => `${m.role === 'user' ? 'Me' : 'Them'}: ${m.content}`)
      .join("\n");

    const promptText = `Generate exactly 3 short, natural, highly contextual reply suggestions that "Me" could send next.
Conversation:
${conversationText}

Return ONLY a JSON array of 3 strings: ["reply 1", "reply 2", "reply 3"]`;

    const parsedArray = await generateAIJSONResponse<string[]>([
      { role: "user", content: promptText }
    ]);

    if (Array.isArray(parsedArray)) {
      return NextResponse.json({ replies: parsedArray.slice(0, 3) });
    }

    return NextResponse.json({ error: "AI failed to return a valid array" }, { status: 500 });

  } catch (error: any) {
    console.error("Smart Reply Pipeline Error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to contact AI service." 
    }, { status: 500 });
  }
}
