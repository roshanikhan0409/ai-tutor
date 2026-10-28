import { NextResponse } from "next/server";
import { askJson } from "@/lib/ai";

type Wrong = { question: string; chosen: string; correct: string; concept: string };

type Confidence = "high" | "medium" | "low";

type Weak = {
  concept: string;
  why: string;
  prerequisite: string | null; // the most foundational missing concept
  chain: string[]; // foundational -> ... -> concept
  confidence: Confidence;
  missed: number; // how many wrong answers point to this concept
};

const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
const MAX_RESULTS = 3;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Fallback when the model fails: group wrong answers by their tagged concept.
function fallbackFromWrong(wrong: Wrong[]): Weak[] {
  const counts = new Map<string, number>();
  for (const w of wrong) counts.set(w.concept, (counts.get(w.concept) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_RESULTS)
    .map(([concept, missed]) => ({
      concept,
      why: "You missed questions on this concept.",
      prerequisite: null,
      chain: [concept],
      confidence: missed > 1 ? "high" : "medium",
      missed,
    }));
}

export async function POST(req: Request) {
  let body: { topic?: unknown; wrong?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const topic = str(body.topic).slice(0, 100);
  const wrong: Wrong[] = Array.isArray(body.wrong)
    ? (body.wrong as Wrong[]).filter((w) => w && typeof w.question === "string").slice(0, 20)
    : [];

  if (!topic || wrong.length === 0) {
    return NextResponse.json({ weak_concepts: [] });
  }

  // How many wrong answers were tagged with each concept (evidence strength).
  const missedBy = new Map<string, number>();
  for (const w of wrong) {
    const k = norm(w.concept);
    missedBy.set(k, (missedBy.get(k) ?? 0) + 1);
  }

  const listing = wrong
    .map(
      (w, i) =>
        `${i + 1}. Question: ${w.question}\n   Student chose: ${w.chosen}\n   Correct answer: ${w.correct}\n   Tagged concept: ${w.concept}`
    )
    .join("\n");

  const prompt = `A student is learning "${topic}". They answered these questions incorrectly:
${listing}

Act as a gap analyzer. Look at WHAT the student chose, not just that it was wrong, and infer the misunderstanding.
Identify up to ${MAX_RESULTS} weak concepts. For each one, trace the mistake back to the foundational prerequisite concept the student is probably missing.
"chain" lists concepts from most foundational to the weak concept itself (2 to 4 items, the last item equals "concept"). If there is no deeper prerequisite, use a one-item chain.
"confidence" is "high" if several mistakes or one clear misconception point to it, "medium" if likely, "low" if a guess.
Return ONLY a JSON object in exactly this format, with no other text:
{
  "weak_concepts": [
    {
      "concept": "short name",
      "why": "one sentence on what the student likely misunderstands",
      "chain": ["foundational concept", "intermediate concept", "short name"],
      "confidence": "high"
    }
  ]
}`;

  try {
    const data = await askJson(prompt);
    const raw: unknown[] = Array.isArray(data?.weak_concepts) ? data.weak_concepts : [];

    const merged = new Map<string, Weak>();
    for (const item of raw) {
      const r = item as Record<string, unknown>;
      const concept = str(r.concept);
      if (!concept) continue;

      const chainRaw = Array.isArray(r.chain) ? r.chain.map(str).filter(Boolean) : [];
      const chain = (chainRaw.length ? chainRaw : [concept]).slice(-4);
      if (norm(chain[chain.length - 1]) !== norm(concept)) chain.push(concept);

      const confidence: Confidence =
        r.confidence === "high" || r.confidence === "low" ? r.confidence : "medium";

      const weak: Weak = {
        concept,
        why: str(r.why) || "You missed questions on this concept.",
        prerequisite: chain.length > 1 ? chain[0] : null,
        chain,
        confidence,
        missed: missedBy.get(norm(concept)) ?? 1,
      };

      const key = norm(concept);
      const existing = merged.get(key);
      if (!existing || RANK[weak.confidence] > RANK[existing.confidence]) merged.set(key, weak);
    }

    const weak_concepts = [...merged.values()]
      .sort((a, b) => RANK[b.confidence] - RANK[a.confidence] || b.missed - a.missed)
      .slice(0, MAX_RESULTS);

    if (weak_concepts.length === 0) throw new Error("No usable gaps returned");
    return NextResponse.json({ weak_concepts });
  } catch (err) {
    console.error("Gap analysis failed, using fallback:", err);
    return NextResponse.json({ weak_concepts: fallbackFromWrong(wrong), fallback: true });
  }
}