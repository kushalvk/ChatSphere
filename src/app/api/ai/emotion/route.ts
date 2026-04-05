import { NextRequest, NextResponse } from "next/server";
import { generateAIJSONResponse } from "@/lib/ai/openrouter";

export type EmotionType = "happy" | "sad" | "angry" | "frustrated" | "neutral" | "excited";
export type SentimentType = "positive" | "negative" | "neutral";

export interface EmotionResult {
  emotion: EmotionType;
  sentiment: SentimentType;
  emotionConfidence: number;
}

export const EMOTION_FALLBACK: EmotionResult = {
  emotion: "neutral",
  sentiment: "neutral",
  emotionConfidence: 0,
};

const VALID_EMOTIONS: EmotionType[] = ["happy", "sad", "angry", "frustrated", "neutral", "excited"];
const VALID_SENTIMENTS: SentimentType[] = ["positive", "negative", "neutral"];

export async function analyzeEmotion(message: string): Promise<EmotionResult> {
  const words = message.trim().split(/\s+/);
  if (words.length < 4) return EMOTION_FALLBACK;

  const prompt = `Analyze the emotional tone of this message: "${message.trim()}"

Return ONLY valid JSON:
{
  "emotion": "happy" | "sad" | "angry" | "frustrated" | "neutral" | "excited",
  "sentiment": "positive" | "negative" | "neutral",
  "confidence": number
}

Rules:
- emotion must be exactly one of the six listed
- sentiment: happy/excited→positive, sad/angry/frustrated→negative, neutral→neutral
- confidence: 0.0-1.0
- Strictly JSON only.`;

  const parsed = await generateAIJSONResponse<any>([
    { role: "user", content: prompt }
  ]);

  if (!parsed) return EMOTION_FALLBACK;

  return {
    emotion: VALID_EMOTIONS.includes(parsed.emotion) ? (parsed.emotion as EmotionType) : "neutral",
    sentiment: VALID_SENTIMENTS.includes(parsed.sentiment) ? (parsed.sentiment as SentimentType) : "neutral",
    emotionConfidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
  };
}

export async function POST(req: NextRequest) {
  try {
    const { message } = (await req.json()) as { message: string };
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Missing message field" }, { status: 400 });
    }

    const result = await analyzeEmotion(message);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Emotion API Error:", error.message);
    return NextResponse.json(EMOTION_FALLBACK);
  }
}
