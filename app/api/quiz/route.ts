import { NextResponse } from "next/server";
import { askJson } from "@/lib/ai";
import { FALLBACK_QUIZ } from "@/lib/fallback";

// Give the function more time on Vercel (needed once the prompt carries history).
export const maxDuration = 60;

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
const MIN_VALID = 3;
const MAX_AVOID = 12;
const MAX_CONCEPTS = 12;

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
  let body: { topic?: unknown; difficulty?: unknown; avoid?: unknown; concepts?: unknown };
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

  // Only the most recent questions, so the prompt stays short and fast.
  const avoid: string[] = Array.isArray(body.avoid)
    ? body.avoid.filter((q): q is string => typeof q === "string").slice(-MAX_AVOID)
    : [];
  const avoidKeys = new Set(avoid.map(normalize));

  // Concept names the student already has progress on, so the model reuses them
  // instead of inventing a new spelling every round.
  const known: string[] = Array.isArray(body.concepts)
    ? body.concepts
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        .map((c) => c.trim().slice(0, 60))
        .slice(-MAX_CONCEPTS)
    : [];

  const focus = pick(FOCUS_ANGLES);

  const avoidBlock = avoid.length
    ? `\nAvoid repeating these previously asked questions:\n${avoid
        .map((q) => `- ${q}`)
        .join("\n")}\n`
    : "";

  const conceptLine = known.length
    ? `\nWhen a question fits one of these concept names, reuse the exact name: ${known.join(", ")}. Otherwise use a short, consistent name in lowercase words.\n`
    : "";

  const prompt = `Create ${COUNT} multiple-choice questions to test a student on "${topic}" at ${difficulty} difficulty.
Every question must be about "${topic}" itself, not a different subject.
Each question must test a DIFFERENT specific concept. For variety, lean towards: ${focus}.
Each question has exactly 4 distinct options and exactly one correct answer.
${avoidBlock}${conceptLine}
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
    // askJson already retries on malformed output, so one call here is enough.
    const data = await askJson(prompt);
    const raw: RawQuestion[] = Array.isArray(data?.questions) ? data.questions : [];

    const seen = new Set<string>();
    const fresh: Question[] = [];
    const repeats: Question[] = [];

    for (const r of raw) {
      const q = cleanQuestion(r);
      if (!q) continue;
      const k = normalize(q.question);
      if (seen.has(k)) continue;
      seen.add(k);
      (avoidKeys.has(k) ? repeats : fresh).push(q);
    }

    // Prefer fresh questions, but never fail just because some were repeats.
    const questions = [...fresh, ...repeats];
    if (questions.length >= MIN_VALID) {
      return NextResponse.json({ questions: questions.slice(0, COUNT) });
    }
    console.error(`Quiz: only ${questions.length} valid questions returned`);
  } catch (err) {
    console.error("Quiz generation failed:", err);
  }

  // Serve the built-in quiz so the demo never breaks.
  return NextResponse.json({ questions: FALLBACK_QUIZ, fallback: true });
}