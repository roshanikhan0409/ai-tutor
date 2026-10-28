import Groq from "groq-sdk";

export const groq = new Groq();

export const MODEL = "openai/gpt-oss-20b";

export function parseJson(text: string) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model output");

  const body = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    return JSON.parse(body.replace(/,\s*([}\]])/g, "$1"));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Calls the model and returns parsed JSON. Retries on malformed output,
// and waits longer when Groq returns a rate-limit (429) error.
export async function askJson(prompt: string, tries = 3) {
  let lastError: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await groq.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });
      return parseJson(res.choices[0]?.message?.content ?? "");
    } catch (err) {
      lastError = err;
      console.error(`askJson attempt ${i + 1}/${tries} failed:`, err);
      if (i < tries - 1) {
        const status = (err as { status?: number })?.status;
        await sleep(status === 429 ? 4000 * (i + 1) : 500);
      }
    }
  }
  throw lastError;
}