import { NextResponse } from "next/server";
import { groq, MODEL, parseJson } from "@/lib/ai";

export async function POST(req: Request) {
  const { topic, concept, why, difficulty = "medium" } = await req.json();

  const prompt = `A student learning "${topic}" is weak at "${concept}" (${why}).
Write a short, friendly micro-lesson (max 120 words) in simple language with one concrete example.
Then write 3 multiple-choice practice questions on this concept at ${difficulty} difficulty.
Return ONLY a JSON object in exactly this format, with no other text:
{
  "lesson": "...",
  "practice": [
    { "question": "...", "options": ["...", "...", "...", "..."], "answer": 0, "concept": "${concept}" }
  ]
}
"answer" is the index (0-3) of the correct option.`;

  try {
    const res = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
    });

    const data = parseJson(res.choices[0].message.content ?? "{}");
    return NextResponse.json({
      lesson: data.lesson ?? "",
      practice: data.practice ?? [],
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Lesson generation failed" }, { status: 500 });
  }
}