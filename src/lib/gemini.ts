import { GoogleGenAI } from "@google/genai";

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export async function getGeminiResponse(message: string, history: { role: string; parts: { text: string }[] }[]) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [...history, { role: "user", parts: [{ text: message }] }],
      config: {
        systemInstruction: "You are a helpful and friendly AI assistant. Keep your responses concise and engaging for voice interaction.",
      },
    });

    return response.text || "I'm sorry, I couldn't generate a response.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Something went wrong. Please try again.";
  }
}
