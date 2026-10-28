"use client";
import { useEffect, useState, type CSSProperties } from "react";
import {
  nextDifficulty,
  applyAnswer,
  pctOf,
  buildVerdicts,
  START_SCORE,
  type Level,
  type ConceptMastery,
} from "@/lib/adaptive";

type Question = {
  question: string;
  options: string[];
  answer: number;
  concept: string;
  level?: Level;
};
type Wrong = { question: string; chosen: string; correct: string; concept: string };
type Result = {
  score: number;
  total: number;
  wrong: Wrong[];
  outcomes: { concept: string; correct: boolean }[];
};
type Weak = {
  concept: string;
  why: string;
  prerequisite?: string | null;
  chain?: string[];
  confidence?: "high" | "medium" | "low";
  missed?: number;
};
type Step = {
  concept: string;
  why: string;
  role: "prerequisite" | "gap";
  forConcept: string;
};
type Lesson = {
  concept: string;
  lesson: string;
  practice: Question[];
  role: "prerequisite" | "gap";
  forConcept: string;
  reason: string;
  difficulty: Level;
};
type Mastery = Record<string, ConceptMastery>;
type Stage = "topic" | "quiz" | "results" | "lesson" | "practice" | "progress";

const card: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 20,
  marginTop: 16,
};
const btn: CSSProperties = {
  background: "#111",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 16px",
  cursor: "pointer",
  fontSize: 15,
};
const tag: CSSProperties = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  color: "#333",
  marginLeft: 8,
};

const GOOD = "#2e9e5b";
const WARN = "#d98e04";
const BAD = "#d64545";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Request failed");
  return res.json() as Promise<T>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fix = (qs: Question[]) => qs.map((q) => ({ ...q, answer: Number(q.answer) }));

// Canonical concept key: "Loop-Else", "loop_else" and "loop else" are all the same concept.
const canon = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const label = (k: string) => (k ? k.charAt(0).toUpperCase() + k.slice(1) : k);

const LEVELS: Level[] = ["easy", "medium", "hard"];
const MAX_STEPS = 4;

// Turns the gap analysis into an ordered curriculum: prerequisites come first,
// then the concept that depends on them. Caps the path so lessons stay short.
function buildPlan(weak: Weak[]): Step[] {
  const seen = new Set<string>();
  const steps: Step[] = [];

  for (const w of weak) {
    const chain = w.chain && w.chain.length ? w.chain : [w.concept];
    const group: Step[] = [];
    chain.forEach((c, i) => {
      if (seen.has(canon(c))) return;
      const isTarget = i === chain.length - 1;
      group.push({
        concept: c,
        why: isTarget ? w.why : `Foundation you need before "${w.concept}".`,
        role: isTarget ? "gap" : "prerequisite",
        forConcept: w.concept,
      });
    });

    if (steps.length > 0 && steps.length + group.length > MAX_STEPS) continue;
    group.forEach((s) => seen.add(canon(s.concept)));
    steps.push(...group);
  }
  return steps;
}

// Saved progress may come from an older version (no live score, differently
// spelled concept names) or be corrupted. Normalize keys and merge duplicates.
function sanitizeMastery(raw: unknown): Mastery {
  const out: Mastery = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [concept, v] of Object.entries(raw as Record<string, unknown>)) {
    const m = v as Partial<ConceptMastery>;
    if (typeof m?.right !== "number" || typeof m?.total !== "number" || m.total <= 0) continue;
    const k = canon(concept);
    if (!k) continue;
    const prev = out[k];
    if (prev) {
      // Merging variants: the live score is dropped and re-derived from the counts.
      out[k] = { right: prev.right + m.right, total: prev.total + m.total };
    } else {
      out[k] = {
        right: m.right,
        total: m.total,
        ...(typeof m.score === "number" ? { score: m.score } : {}),
      };
    }
  }
  return out;
}

function Bars({ mastery }: { mastery: Mastery }) {
  const items = Object.entries(mastery);
  if (!items.length) return null;
  return (
    <div>
      {items.map(([concept, m]) => {
        const p = pctOf(m);
        const color = p >= 70 ? GOOD : p >= 40 ? WARN : BAD;
        return (
          <div key={concept} style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span>{label(concept)}</span>
              <span>{p}%</span>
            </div>
            <div style={{ height: 8, background: "#eee", borderRadius: 4 }}>
              <div
                style={{
                  width: `${p}%`,
                  height: "100%",
                  background: color,
                  borderRadius: 4,
                  transition: "width 0.4s",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuizRunner({
  questions,
  mastery,
  onAnswer,
  onFinish,
}: {
  questions: Question[];
  mastery: Mastery;
  onAnswer: (concept: string, correct: boolean, level: Level) => void;
  onFinish: (r: Result) => void;
}) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [shift, setShift] = useState<{ from: number; to: number } | null>(null);
  const [log, setLog] = useState<{ q: Question; chosen: number }[]>([]);
  const q = questions[i];

  // Recalibrate this concept's mastery the moment the student answers.
  function choose(j: number) {
    if (picked !== null) return;
    const correct = j === q.answer;
    const lv = q.level ?? "medium";
    const cur = mastery[canon(q.concept)];
    setPicked(j);
    setShift({
      from: cur ? pctOf(cur) : START_SCORE,
      to: pctOf(applyAnswer(cur, correct, lv)),
    });
    onAnswer(q.concept, correct, lv);
  }

  function next() {
    const newLog = [...log, { q, chosen: picked as number }];
    if (i + 1 < questions.length) {
      setLog(newLog);
      setI(i + 1);
      setPicked(null);
      setShift(null);
      return;
    }
    const wrong = newLog
      .filter((x) => x.chosen !== x.q.answer)
      .map((x) => ({
        question: x.q.question,
        chosen: x.q.options[x.chosen],
        correct: x.q.options[x.q.answer],
        concept: x.q.concept,
      }));
    onFinish({
      score: newLog.length - wrong.length,
      total: newLog.length,
      wrong,
      outcomes: newLog.map((x) => ({ concept: x.q.concept, correct: x.chosen === x.q.answer })),
    });
  }

  return (
    <div>
      <div style={{ height: 6, background: "#eee", borderRadius: 3 }}>
        <div
          style={{
            width: `${(i / questions.length) * 100}%`,
            height: "100%",
            background: "#111",
            borderRadius: 3,
          }}
        />
      </div>
      <p style={{ fontSize: 13, color: "#777" }}>
        Question {i + 1} of {questions.length}
      </p>
      <p style={{ fontSize: 17, fontWeight: 500 }}>{q.question}</p>
      {q.options.map((o, j) => {
        let bg = "#fff";
        let border = "#ccc";
        if (picked !== null) {
          if (j === q.answer) {
            bg = "#e6f6ec";
            border = GOOD;
          } else if (j === picked) {
            bg = "#fdeaea";
            border = BAD;
          }
        }
        return (
          <button
            key={j}
            disabled={picked !== null}
            onClick={() => choose(j)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "10px 12px",
              marginTop: 8,
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 15,
              color: "#111",
            }}
          >
            {o}
          </button>
        );
      })}
      {picked !== null && shift && (
        <p style={{ marginTop: 14, fontSize: 14, color: "#555" }}>
          Mastery of <b>{label(canon(q.concept))}</b>: {shift.from}% →{" "}
          <b style={{ color: shift.to >= shift.from ? GOOD : BAD }}>{shift.to}%</b>
        </p>
      )}
      {picked !== null && (
        <button style={{ ...btn, marginTop: 8 }} onClick={next}>
          {i + 1 < questions.length ? "Next" : "Finish"}
        </button>
      )}
    </div>
  );
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("topic");
  const [topic, setTopic] = useState("");
  const [asked, setAsked] = useState<string[]>([]);
  const [level, setLevel] = useState<Level>("medium");
  const [nextLevel, setNextLevel] = useState<Level>("medium");
  const [round, setRound] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [practiceResult, setPracticeResult] = useState<Result | null>(null);
  const [weak, setWeak] = useState<Weak[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [practice, setPractice] = useState<Question[]>([]);
  const [mastery, setMastery] = useState<Mastery>({});
  const [before, setBefore] = useState<Mastery>({});
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("tutor-mastery");
      if (saved) setMastery(sanitizeMastery(JSON.parse(saved)));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem("tutor-mastery", JSON.stringify(mastery));
    } catch {}
  }, [mastery, loaded]);

  // Called after every single answer, so mastery is always current.
  function recordAnswer(concept: string, correct: boolean, lv: Level) {
    const k = canon(concept);
    if (!k) return;
    setMastery((prev) => ({ ...prev, [k]: applyAnswer(prev[k], correct, lv) }));
  }

  // Drill difficulty follows the student's current mastery of that concept.
  function drillLevel(concept: string): Level {
    const m = mastery[canon(concept)];
    if (!m) return level;
    const p = pctOf(m);
    if (p < 40) return "easy";
    if (p < 70) return "medium";
    return level;
  }

  // Feedback loop result for the round (only meaningful on the progress screen).
  const verdicts =
    stage === "progress"
      ? buildVerdicts(
          lessons.map((l) => ({
            concept: canon(l.concept),
            role: l.role,
            forConcept: l.forConcept,
          })),
          before,
          mastery
        )
      : [];
  const gapVerdicts = verdicts.filter((v) => v.role === "gap");
  const hasBadGap = gapVerdicts.some((v) => v.tone === "bad");
  const allGapsGood = gapVerdicts.length > 0 && gapVerdicts.every((v) => v.tone === "good");

  // Never raise the difficulty while a gap is still unresolved.
  const plannedLevel: Level =
    hasBadGap && LEVELS.indexOf(nextLevel) > LEVELS.indexOf(level) ? level : nextLevel;

  async function startQuiz(lv: Level) {
    setError("");
    setLoading(true);
    try {
      const body = {
        topic: topic.trim(),
        difficulty: lv,
        avoid: asked,
        concepts: Object.keys(mastery).slice(-12),
      };
      let data: { questions: Question[] };
      try {
        data = await post<{ questions: Question[] }>("/api/quiz", body);
      } catch {
        // One automatic retry covers brief rate limits and malformed model output.
        await sleep(3000);
        data = await post<{ questions: Question[] }>("/api/quiz", body);
      }
      if (!data.questions.length) throw new Error("empty");
      setQuestions(fix(data.questions).map((q) => ({ ...q, level: lv })));
      setAsked((prev) => [...prev, ...data.questions.map((q) => q.question)].slice(-30));
      setRound((r) => r + 1);
      setStage("quiz");
    } catch {
      setError("Could not generate the quiz. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  async function onQuizFinish(r: Result) {
    setResult(r);
    setNextLevel(nextDifficulty(level, r.score, r.total));
    setWeak([]);
    setStage("results");
    if (r.wrong.length === 0) return;
    setLoading(true);
    try {
      const g = await post<{ weak_concepts: Weak[] }>("/api/gaps", { topic, wrong: r.wrong });
      setWeak(g.weak_concepts);
    } catch {
      const seen = new Set<string>();
      const concepts = r.wrong
        .map((w) => w.concept)
        .filter((c) => !seen.has(canon(c)) && seen.add(canon(c)));
      setWeak(concepts.map((c) => ({ concept: c, why: "You missed questions on this concept." })));
    } finally {
      setLoading(false);
    }
  }

  async function startLesson() {
    setError("");
    setLoading(true);
    try {
      setBefore(mastery);
      const plan = buildPlan(weak);
      const levels = plan.map((s) => drillLevel(s.concept));
      const out = await Promise.all(
        plan.map((step, idx) =>
          post<{ lesson: string; practice: Question[] }>("/api/lesson", {
            topic,
            concept: step.concept,
            why: step.why,
            role: step.role,
            forConcept: step.forConcept,
            difficulty: levels[idx],
            mastery: mastery[canon(step.concept)] ? pctOf(mastery[canon(step.concept)]) : null,
          })
        )
      );
      setLessons(
        out.map((l, idx) => ({
          concept: plan[idx].concept,
          lesson: l.lesson,
          practice: fix(l.practice).map((q) => ({ ...q, level: levels[idx] })),
          role: plan[idx].role,
          forConcept: plan[idx].forConcept,
          reason: plan[idx].why,
          difficulty: levels[idx],
        }))
      );
      setStage("lesson");
    } catch {
      setError("Could not write the lesson. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  function startPractice() {
    const qs = lessons.flatMap((l) => l.practice);
    if (!qs.length) return;
    setPractice(qs);
    setStage("practice");
  }

  function onPracticeFinish(r: Result) {
    setPracticeResult(r);
    if (result) setNextLevel(nextDifficulty(level, result.score + r.score, result.total + r.total));
    setStage("progress");
  }

  function nextRound() {
    const target = stage === "progress" ? plannedLevel : nextLevel;
    setLevel(target);
    startQuiz(target);
  }

  function reset() {
    setStage("topic");
    setAsked([]);
    setLevel("medium");
    setNextLevel("medium");
    setResult(null);
    setPracticeResult(null);
    setWeak([]);
    setLessons([]);
  }

  const toneColor = (t: "good" | "ok" | "bad") => (t === "good" ? GOOD : t === "ok" ? WARN : BAD);

  return (
    <main style={{ minHeight: "100vh", background: "#f7f7f8", color: "#111", padding: "32px 16px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>AI Tutor</h1>
        <p style={{ color: "#666", marginTop: 4 }}>
          Learns how you learn.
          {stage !== "topic" && ` Topic: ${topic} · Level: ${level}`}
        </p>

        {error && (
          <div style={{ ...card, background: "#fdeaea", borderColor: BAD, color: "#8a1f1f" }}>
            {error}
          </div>
        )}

        {stage === "topic" && (
          <div style={card}>
            <p style={{ marginTop: 0 }}>What do you want to learn?</p>
            <input
              value={topic}
              placeholder="e.g. Photosynthesis, Fractions, Python loops"
              onChange={(e) => {
                setTopic(e.target.value);
                setAsked([]);
              }}
              style={{
                width: "100%",
                padding: 10,
                fontSize: 15,
                border: "1px solid #ccc",
                borderRadius: 8,
                color: "#111",
                background: "#fff",
              }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {["Python loops", "Photosynthesis", "Fractions", "World War II", "Newton's laws"].map(
                (t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTopic(t);
                      setAsked([]);
                    }}
                    style={{
                      background: "#f0f0f2",
                      color: "#111",
                      border: "1px solid #ddd",
                      borderRadius: 999,
                      padding: "6px 12px",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    {t}
                  </button>
                )
              )}
            </div>
            <div style={{ marginTop: 16 }}>
              <button
                style={btn}
                disabled={loading || !topic.trim()}
                onClick={() => startQuiz(level)}
              >
                {loading ? "Creating your quiz..." : "Start diagnostic"}
              </button>
            </div>
            {Object.keys(mastery).length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h3 style={{ marginBottom: 0 }}>Your saved progress</h3>
                <Bars mastery={mastery} />
                <button
                  style={{ ...btn, background: "#666", marginTop: 16, fontSize: 13, padding: "6px 12px" }}
                  onClick={() => setMastery({})}
                >
                  Clear saved progress
                </button>
              </div>
            )}
          </div>
        )}

        {stage === "quiz" && (
          <div style={card}>
            <QuizRunner
              key={`quiz-${round}`}
              questions={questions}
              mastery={mastery}
              onAnswer={recordAnswer}
              onFinish={onQuizFinish}
            />
          </div>
        )}

        {stage === "results" && result && (
          <div style={card}>
            <h2 style={{ marginTop: 0 }}>
              Score: {result.score} / {result.total}
            </h2>
            {loading ? (
              <p>Analyzing your answers...</p>
            ) : weak.length > 0 ? (
              <>
                <h3>Your knowledge gaps</h3>
                {weak.map((w) => (
                  <div key={w.concept} style={{ marginTop: 14 }}>
                    <b>{w.concept}</b>
                    {w.confidence && (
                      <span
                        style={{
                          ...tag,
                          background:
                            w.confidence === "high"
                              ? "#fdeaea"
                              : w.confidence === "medium"
                                ? "#fff4d6"
                                : "#eee",
                        }}
                      >
                        {w.confidence} confidence
                      </span>
                    )}
                    <br />
                    <span style={{ color: "#555" }}>{w.why}</span>
                    {w.chain && w.chain.length > 1 && (
                      <div style={{ marginTop: 6, fontSize: 13, color: "#777" }}>
                        Learning path: {w.chain.join(" → ")}
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ marginTop: 16 }}>
                  <button style={btn} disabled={loading} onClick={startLesson}>
                    Start my personalized lesson
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>No gaps found. Great work!</p>
                <button style={btn} disabled={loading} onClick={nextRound}>
                  {loading ? "Creating your quiz..." : `Next round (${nextLevel})`}
                </button>
              </>
            )}
            {!loading && (
              <>
                <h3 style={{ marginTop: 24 }}>Concept mastery</h3>
                <Bars mastery={mastery} />
              </>
            )}
          </div>
        )}

        {stage === "lesson" && (
          <div>
            <div style={card}>
              <h3 style={{ marginTop: 0 }}>Your learning path</h3>
              <p style={{ margin: 0, color: "#555" }}>
                {lessons.map((l) => l.concept).join(" → ")}
              </p>
            </div>
            {lessons.map((l, idx) => (
              <div key={l.concept} style={card}>
                <div style={{ fontSize: 12, color: "#777" }}>
                  Step {idx + 1} of {lessons.length}
                </div>
                <h3 style={{ margin: "4px 0 0" }}>
                  {l.concept}
                  <span
                    style={{
                      ...tag,
                      background: l.role === "prerequisite" ? "#e8f0fe" : "#fdeaea",
                    }}
                  >
                    {l.role === "prerequisite" ? "prerequisite" : "your gap"}
                  </span>
                  <span style={{ ...tag, background: "#eee" }}>{l.difficulty} drills</span>
                </h3>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#777" }}>{l.reason}</p>
                <p style={{ lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{l.lesson}</p>
              </div>
            ))}
            <div style={{ marginTop: 16 }}>
              <button style={btn} onClick={startPractice}>
                Practice what you learned
              </button>
            </div>
          </div>
        )}

        {stage === "practice" && (
          <div style={card}>
            <QuizRunner
              key="practice"
              questions={practice}
              mastery={mastery}
              onAnswer={recordAnswer}
              onFinish={onPracticeFinish}
            />
          </div>
        )}

        {stage === "progress" && practiceResult && (
          <div style={card}>
            <h2 style={{ marginTop: 0 }}>
              Practice: {practiceResult.score} / {practiceResult.total}
            </h2>

            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: allGapsGood ? "#e6f6ec" : hasBadGap ? "#fdeaea" : "#fff4d6",
                fontSize: 14,
              }}
            >
              {allGapsGood
                ? "You have mastered the gaps from this round. Time to level up."
                : hasBadGap
                  ? "Some gaps are still weak. The next round stays at this level and revisits them."
                  : "Good progress. One more round will lock these concepts in."}
            </div>

            <h3>What to do next</h3>
            {verdicts.map((v) => (
              <div
                key={v.concept}
                style={{
                  marginTop: 10,
                  paddingLeft: 12,
                  borderLeft: `4px solid ${toneColor(v.tone)}`,
                }}
              >
                <div style={{ fontSize: 14 }}>
                  <b>{label(v.concept)}</b>
                  <span style={{ ...tag, background: "#eee" }}>
                    {v.role === "prerequisite" ? "prerequisite" : "gap"}
                  </span>{" "}
                  {v.from !== null ? `${v.from}% → ` : "new: "}
                  <b>{v.to}%</b>
                </div>
                <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>{v.message}</div>
              </div>
            ))}

            <h3>Concept mastery</h3>
            <Bars mastery={mastery} />
            <p style={{ marginTop: 20 }}>
              Next quiz difficulty: <b>{plannedLevel}</b>
            </p>
            <button style={btn} disabled={loading} onClick={nextRound}>
              {loading ? "Creating your quiz..." : "Start next round"}
            </button>{" "}
            <button style={{ ...btn, background: "#666" }} onClick={reset}>
              New topic
            </button>
          </div>
        )}
      </div>
    </main>
  );
}