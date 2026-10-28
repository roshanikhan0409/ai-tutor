import Groq from "groq-sdk";

export const groq = new Groq();

export const MODEL = "openai/gpt-oss-20b";

export function parseJson(text: string) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function askJson(prompt: string, tries = 2) {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await groq.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
      });
      return parseJson(res.choices[0].message.content ?? "{}");
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}