import { NextResponse } from "next/server";
import { askJson } from "@/lib/ai";
import { FALLBACK_QUIZ } from "@/lib/fallback";

type RawQuestion = {
  question?: unknown;
  options?: unknown;
  answer?: unknown;
  concept?: unknown;
};

type Question = {
  question: string;
  options: string[];
  answer: number;
  concept: string;
};

const COUNT = 5;
const MAX_ATTEMPTS = 2;

// A different angle each round keeps questions from repeating on the same topic.
const FOCUS_ANGLES = [
  "core definitions and terminology",
  "applying the idea to a small realistic example",
  "spotting mistakes or common misconceptions",
  "predicting what happens or what the result will be",
  "cause-and-effect and why things work the way they do",
  "comparing similar ideas and telling them apart",
  "edge cases and tricky situations",
];

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Validates one generated question and shuffles its options so the
// correct answer isn't always in the same position.
function cleanQuestion(raw: RawQuestion): Question | null {
  if (typeof raw.question !== "string" || !raw.question.trim()) return null;
  if (!Array.isArray(raw.options) || raw.options.length !== 4) return null;

  const options = raw.options.map((o) => String(o).trim());
  if (options.some((o) => !o) || new Set(options.map(normalize)).size !== 4) return null;

  const answer = Number(raw.answer);
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) return null;

  const correctText = options[answer];
  const shuffled = shuffle(options);

  return {
    question: raw.question.trim(),
    options: shuffled,
    answer: shuffled.indexOf(correctText),
    concept:
      typeof raw.concept === "string" && raw.concept.trim() ? raw.concept.trim() : "General",
  };
}

export async function POST(req: Request) {
  let body: { topic?: unknown; difficulty?: unknown; avoid?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 100) : "";
  if (!topic) {
    return NextResponse.json({ error: "Please enter a topic" }, { status: 400 });
  }

  const difficulty = ["easy", "medium", "hard"].includes(body.difficulty as string)
    ? (body.difficulty as string)
    : "medium";

  // Questions already shown to this student, so we don't repeat them.
  const avoid: string[] = Array.isArray(body.avoid)
    ? body.avoid.filter((q): q is string => typeof q === "string").slice(-30)
    : [];
  const avoidKeys = new Set(avoid.map(normalize));

  const focus = pick(FOCUS_ANGLES);
  const avoidBlock = avoid.length
    ? `\nDo NOT repeat or closely rephrase any of these previously asked questions:\n${avoid
        .map((q) => `- ${q}`)
        .join("\n")}\n`
    : "";

  const prompt = `Create ${COUNT} multiple-choice questions to test a student on "${topic}" at ${difficulty} difficulty.
Every question must be about "${topic}" itself, not a different subject.
Each question must test a DIFFERENT specific concept. For variety, lean towards: ${focus}.
Each question has exactly 4 distinct options and exactly one correct answer.
${avoidBlock}
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

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const data = await askJson(prompt);
      const raw: RawQuestion[] = Array.isArray(data?.questions) ? data.questions : [];

      const seen = new Set<string>();
      const questions: Question[] = [];
      for (const r of raw) {
        const q = cleanQuestion(r);
        if (!q) continue;
        const key = normalize(q.question);
        if (avoidKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        questions.push(q);
      }

      // Accept the batch if enough