import Groq from "groq-sdk";

export const groq = new Groq();

export const MODEL = "openai/gpt-oss-20b";

export function parseJson(text: string) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(cleaned.slice(start, end + 1));
}