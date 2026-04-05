import { NextRequest, NextResponse } from "next/server";
import { generateAIJSONResponse } from "@/lib/ai/openrouter";

export type MessageType = "deadline" | "decision" | "task" | "alert" | "payment" | "normal";

export interface ClassificationResult {
  isImportant: boolean;
  type: MessageType;
  confidence: number;
}

const FALLBACK: ClassificationResult = {
  isImportant: false,
  type: "normal",
  confidence: 0,
};

export async function classifyMessage(message: string): Promise<ClassificationResult> {
  if (!message || message.trim().length < 5) return FALLBACK;

  const prompt = `Analyze the following chat message and classify its intent and importance.
Message: "${message.trim()}"

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "isImportant": boolean,
  "type": "deadline" | "decision" | "task" | "alert" | "payment" | "normal",
  "confidence": number
}

Rules:
- deadline: date/time limit/urgency ("by tomorrow", "due at 5pm")
- decision: conclusion made ("we will use", "decided", "approved")
- task: action item ("please fix", "you need to", "can you handle")
- alert: warning/critical ("server down", "urgent", "security issue")
- payment: financial info ("paid", "invoice", "payment done")
- normal: casual chat, greetings, acknowledgements
- isImportant: true if type is NOT normal
- confidence: 0.0-1.0`;

  const parsed = await generateAIJSONResponse<ClassificationResult>([
    { role: "user", content: prompt }
  ]);

  if (!parsed) return FALLBACK;

  const validTypes: MessageType[] = ["deadline", "decision", "task", "alert", "payment", "normal"];
  return {
    isImportant: Boolean(parsed.isImportant),
    type: validTypes.includes(parsed.type) ? (parsed.type as MessageType) : "normal",
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message } = body as { message: string };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Missing message field" }, { status: 400 });
    }

    const result = await classifyMessage(message);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Classify API Error:", error.message);
    return NextResponse.json(FALLBACK);
  }
}
