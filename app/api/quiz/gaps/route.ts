import { NextResponse } from "next/server";
import { groq, MODEL, parseJson } from "@/lib/ai";

export async function POST(req: Request) {
  const { topic, wrong } = await req.json();

  const prompt = `A student is learning "${topic}". They answered these questions incorrectly:
${JSON.stringify(wrong, null, 2)}

Identify up to 3 underlying weak concepts. Include prerequisite concepts if the mistake suggests a deeper gap.
Return ONLY a JSON object in exactly this format, with no other text:
{
  "weak_concepts": [
    { "concept": "short name", "why": "one sentence on what the student likely misunderstands" }
  ]
}`;

  try {
    const res = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
    });

    const data = parseJson(res.choices[0].message.content ?? "{}");
    return NextResponse.json({ weak_concepts: data.weak_concepts ?? [] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Gap analysis failed" }, { status: 500 });
  }
}