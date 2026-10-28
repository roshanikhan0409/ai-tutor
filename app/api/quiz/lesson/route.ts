import { NextResponse } from "next/server";
import { askJson } from "@/lib/ai";
import { fallbackLesson } from "@/lib/fallback";

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
    const data = await askJson(prompt);
    if (!data.lesson || !Array.isArray(data.practice) || data.practice.length === 0) {
      throw new Error("Bad lesson");
    }
    return NextResponse.json({ lesson: data.lesson, practice: data.practice });
  } catch (err) {
    console.error(err);
    return NextResponse.json(fallbackLesson(concept));
  }
}