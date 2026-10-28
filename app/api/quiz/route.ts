import { NextResponse } from "next/server";
import { groq, MODEL, parseJson } from "@/lib/ai";

export async function POST(req: Request) {
  const { topic, difficulty = "medium" } = await req.json();

  const prompt = `Create 5 multiple-choice questions to test a student on "${topic}" at ${difficulty} difficulty.
Each question must test a DIFFERENT specific concept.
Return ONLY a JSON object in exactly this format, with no other text:
{
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "answer": 0,
      "concept": "short concept name"
    }
  ]
}
"answer" is the index (0-3) of the correct option.`;

  try {
    const res = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
    });

    const data = parseJson(res.choices[0].message.content ?? "{}");
    return NextResponse.json({ questions: data.questions ?? [] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Quiz generation failed" }, { status: 500 });
  }
}