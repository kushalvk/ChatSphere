import { generateAIResponse } from "./openrouter";

/**
 * Detects the language of a given text and returns its ISO 639-1 code.
 * Falls back to "en" if detection fails.
 */
export async function detectLanguage(text: string): Promise<string> {
  if (!text || text.trim().length < 2) return "en";

  try {
    const response = await generateAIResponse([
      {
        role: "system",
        content: "Detect the language of the provided text. Return ONLY the ISO 639-1 code (e.g., 'en', 'hi', 'es'). No other text."
      },
      {
        role: "user",
        content: `Text: ${text}`
      }
    ]);

    const code = response.trim().toLowerCase();
    // Simple validation: should be 2 characters (ISO code) or maybe 3 for some.
    // If it's longer, it might have failed or given a sentence.
    if (code.length >= 2 && code.length <= 5) {
      return code;
    }
    return "en";
  } catch (err) {
    console.error("Language detection error:", err);
    return "en";
  }
}

/**
 * Translates the text into the target language.
 */
export async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text || !targetLang || targetLang === "en") return text; // Optimization: Skip if no target or default is English (assuming sender is en too)
  
  try {
    const response = await generateAIResponse([
      {
        role: "system",
        content: "You are a professional translation engine."
      },
      {
        role: "user",
        content: `Translate the following text into the language with ISO code '${targetLang}'. Return ONLY the translated text. No explanation, no intro, no punctuation unless part of the translation.\n\nText: ${text}`
      }
    ]);

    return response.trim();
  } catch (err) {
    console.error("Translation error:", err);
    return text; // Fallback to original
  }
}
