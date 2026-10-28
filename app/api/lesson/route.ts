import { NextResponse } from "next/server";
import { askJson } from "@/lib/ai";

type RawQuestion = {
  question?: unknown;
  options?: unknown;
  answer?: unknown;
};

type Question = {
  question: string;
  options: string[];
  answer: number;
  concept: string;
};

const MAX_ATTEMPTS = 2;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Validates one drill question and shuffles options so the answer position varies.
function cleanQuestion(raw: RawQuestion, concept: string): Question | null {
  const question = str(raw.question);
  if (!question) return null;
  if (!Array.isArray(raw.options) || raw.options.length !== 4) return null;

  const options = raw.options.map((o) => String(o).trim());
  if (options.some((o) => !o) || new Set(options.map(normalize)).size !== 4) return null;

  const answer = Number(raw.answer);
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) return null;

  const correctText = options[answer];
  const shuffled = shuffle(options);
  return { question, options: shuffled, answer: shuffled.indexOf(correctText), concept };
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const topic = str(body.topic).slice(0, 100);
  const concept = str(body.concept).slice(0, 100);
  const why = str(body.why).slice(0, 300);
  const forConcept = str(body.forConcept).slice(0, 100);
  const role = body.role === "prerequisite" ? "prerequisite" : "gap";
  const difficulty = ["easy", "medium", "hard"].includes(body.difficulty as string)
    ? (body.difficulty as string)
    : "medium";
  const mastery =
    typeof body.mastery === "number" && body.mastery >= 0 && body.mastery <= 100
      ? Math.round(body.mastery)
      : null;

  if (!topic || !concept) {
    return NextResponse.json({ error: "Topic and concept are required" }, { status: 400 });
  }

  const roleLine =
    role === "prerequisite" && forConcept
      ? `This concept is a PREREQUISITE the student needs before they can understand "${forConcept}". End the lesson with one sentence linking it to "${forConcept}".`
      : `This is a direct gap the student showed in the diagnostic.`;

  const masteryLine =
    mastery !== null
      ? `The student's current mastery of this concept is ${mastery}%, so pitch the lesson accordingly.`
      : `This is a new concept for the student, so assume no prior knowledge.`;

  const prompt = `A student learning "${topic}" is weak at "${concept}"${why ? ` (${why})` : ""}.
${roleLine}
${masteryLine}
Write a short, friendly micro-lesson (max 120 words) in simple language with one concrete example.
Then write 3 multiple-choice drills on "${concept}" at ${difficulty} difficulty. Each drill has exactly 4 distinct options and one correct answer.
Return ONLY a JSON object in exactly this format, with no other text:
{
  "lesson": "...",
  "practice": [
    { "question": "...", "options": ["...", "...", "...", "..."], "answer": 0 }
  ]
}
"answer" is the index (0-3) of the correct option.`;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const data = await askJson(prompt);
      const lesson = str(data?.lesson);
      const rawPractice: RawQuestion[] = Array.isArray(data?.practice) ? data.practice : [];

      const practice = rawPractice
        .map((r) => cleanQuestion(r, concept))
        .filter((q): q is Question => q !== null)
        .slice(0, 3);

      if (lesson && practice.length >= 2) {
        return NextResponse.json({ lesson, practice });
      }
      console.error(`Lesson attempt ${attempt + 1}: incomplete result`);
    } catch (err) {
      console.error(`Lesson attempt ${attempt + 1} failed:`, err);
    }
  }

  return NextResponse.json({ error: "Lesson generation failed" }, { status: 500 });
}