"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { nextDifficulty, type Level } from "@/lib/adaptive";

type Question = { question: string; options: string[]; answer: number; concept: string };
type Wrong = { question: string; chosen: string; correct: string; concept: string };
type Result = {
  score: number;
  total: number;
  wrong: Wrong[];
  outcomes: { concept: string; correct: boolean }[];
};
type Weak = { concept: string; why: string };
type Lesson = { concept: string; lesson: string; practice: Question[] };
type Mastery = Record<string, { right: number; total: number }>;
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

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Request failed");
  return res.json() as Promise<T>;
}

const fix = (qs: Question[]) => qs.map((q) => ({ ...q, answer: Number(q.answer) }));

const pct = (m?: { right: number; total: number }) =>
  m ? Math.round((m.right / m.total) * 100) : 0;

function Bars({ mastery }: { mastery: Mastery }) {
  const items = Object.entries(mastery);
  if (!items.length) return null;
  return (
    <div>
      {items.map(([concept, m]) => {
        const p = pct(m);
        const color = p >= 70 ? "#2e9e5b" : p >= 40 ? "#d98e04" : "#d64545";
        return (
          <div key={concept} style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span>{concept}</span>
              <span>{p}%</span>
            </div>
            <div style={{ height: 8, background: "#eee", borderRadius: 4 }}>
              <div style={{ width: `${p}%`, height: "100%", background: color, borderRadius: 4 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuizRunner({
  questions,
  onFinish,
}: {
  questions: Question[];
  onFinish: (r: Result) => void;
}) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [log, setLog] = useState<{ q: Question; chosen: number }[]>([]);
  const q = questions[i];

  function next() {
    const newLog = [...log, { q, chosen: picked as number }];
    if (i + 1 < questions.length) {
      setLog(newLog);
      setI(i + 1);
      setPicked(null);
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
            border = "#2e9e5b";
          } else if (j === picked) {
            bg = "#fdeaea";
            border = "#d64545";
          }
        }
        return (
          <button
            key={j}
            disabled={picked !== null}
            onClick={() => setPicked(j)}
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
      {picked !== null && (
        <button style={{ ...btn, marginTop: 16 }} onClick={next}>
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
      if (saved) setMastery(JSON.parse(saved));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem("tutor-mastery", JSON.stringify(mastery));
    } catch {}
  }, [mastery, loaded]);

  function updateMastery(outcomes: { concept: string; correct: boolean }[]) {
    setMastery((prev) => {
      const copy: Mastery = { ...prev };
      for (const o of outcomes) {
        const cur = copy[o.concept] ?? { right: 0, total: 0 };
        copy[o.concept] = { right: cur.right + (o.correct ? 1 : 0), total: cur.total + 1 };
      }
      return copy;
    });
  }

  async function startQuiz(lv: Level) {
    setError("");
    setLoading(true);
    try {
      const data = await post<{ questions: Question[] }>("/api/quiz", {
        topic: topic.trim(),
        difficulty: lv,
        avoid: asked,
      });
      if (!data.questions.length) throw new Error("empty");
      setQuestions(fix(data.questions));
      setAsked((prev) => [...prev, ...data.questions.map((q) => q.question)].slice(-30));
      setRound((r) => r + 1);
      setStage("quiz");
    } catch {
      setError("Could not generate the quiz. Check the terminal for the error and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onQuizFinish(r: Result) {
    setResult(r);
    updateMastery(r.outcomes);
    setNextLevel(nextDifficulty(level, r.score, r.total));
    setWeak([]);
    setStage("results");
    if (r.wrong.length === 0) return;
    setLoading(true);
    try {
      const g = await post<{ weak_concepts: Weak[] }>("/api/gaps", { topic, wrong: r.wrong });
      setWeak(g.weak_concepts);
    } catch {
      const concepts = [...new Set(r.wrong.map((w) => w.concept))];
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
      const top = weak.slice(0, 2);
      const out = await Promise.all(
        top.map((w) =>
          post<{ lesson: string; practice: Question[] }>("/api/lesson", {
            topic,
            concept: w.concept,
            why: w.why,
            difficulty: level,
          })
        )
      );
      setLessons(
        out.map((l, idx) => ({
          concept: top[idx].concept,
          lesson: l.lesson,
          practice: fix(l.practice),
        }))
      );
      setStage("lesson");
    } catch {
      setError("Could not write the lesson. Check the terminal and try again.");
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
    updateMastery(r.outcomes);
    setPracticeResult(r);
    if (result) setNextLevel(nextDifficulty(level, result.score + r.score, result.total + r.total));
    setStage("progress");
  }

  function nextRound() {
    setLevel(nextLevel);
    startQuiz(nextLevel);
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

  return (
    <main style={{ minHeight: "100vh", background: "#f7f7f8", color: "#111", padding: "32px 16px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>AI Tutor</h1>
        <p style={{ color: "#666", marginTop: 4 }}>
          Learns how you learn.
          {stage !== "topic" && ` Topic: ${topic} · Level: ${level}`}
        </p>

        {error && (
          <div style={{ ...card, background: "#fdeaea", borderColor: "#d64545", color: "#8a1f1f" }}>
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
            <QuizRunner key={`quiz-${round}`} questions={questions} onFinish={onQuizFinish} />
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
                  <p key={w.concept}>
                    <b>{w.concept}</b>
                    <br />
                    <span style={{ color: "#555" }}>{w.why}</span>
                  </p>
                ))}
                <button style={btn} disabled={loading} onClick={startLesson}>
                  Start my personalized lesson
                </button>
              </>
            ) : (
              <>
                <p>No gaps found. Great work!</p>
                <button style={btn} onClick={nextRound}>
                  Next round ({nextLevel})
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
            {lessons.map((l) => (
              <div key={l.concept} style={card}>
                <h3 style={{ marginTop: 0 }}>{l.concept}</h3>
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
            <QuizRunner key="practice" questions={practice} onFinish={onPracticeFinish} />
          </div>
        )}

        {stage === "progress" && practiceResult && (
          <div style={card}>
            <h2 style={{ marginTop: 0 }}>
              Practice: {practiceResult.score} / {practiceResult.total}
            </h2>
            <h3>What changed</h3>
            {Object.keys(mastery).map((c) => (
              <p key={c} style={{ margin: "4px 0", fontSize: 14 }}>
                {c}:{" "}
                <b>
                  {before[c] ? `${pct(before[c])}% → ` : "new: "}
                  {pct(mastery[c])}%
                </b>
              </p>
            ))}
            <h3>Concept mastery</h3>
            <Bars mastery={mastery} />
            <p style={{ marginTop: 20 }}>
              Next quiz difficulty: <b>{nextLevel}</b>
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