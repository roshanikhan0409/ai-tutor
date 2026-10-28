# AI Tutor

An adaptive study app that turns a topic into a learning loop: take a quiz, find the concepts you missed, review short targeted lessons, and practice until your understanding improves.

## How It Works

1. Choose a topic and take a five-question multiple-choice quiz.
2. Get an adaptive difficulty for the next round and an analysis of missed concepts.
3. Review short lessons that can include prerequisite concepts, then answer focused practice questions.
4. Track concept mastery across visits. Progress is saved in your browser.

Quiz questions, gap analysis, and lessons are generated with Groq. A built-in quiz and a simpler gap-analysis fallback keep parts of the app usable if AI generation is unavailable; lesson generation requires a working Groq API key.

## Run Locally

**Requirements:** Node.js and npm, plus a [Groq API key](https://console.groq.com/keys).

1. Install dependencies with `npm install`.
2. Create `.env.local` in the project root and add `GROQ_API_KEY=your_groq_api_key`.
3. Start the development server with `npm run dev`.

Open [http://localhost:3000](http://localhost:3000). Keep the API key on the server; do not expose it in client-side code or commit `.env.local`.


## Project Layout

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Tutor interface and adaptive learning flow |
| `app/api/quiz/route.ts` | Quiz generation |
| `app/api/gaps/route.ts` | Missed-concept analysis |
| `app/api/lesson/route.ts` | Targeted lesson and practice generation |
| `lib/adaptive.ts` | Difficulty and mastery calculations |
| `lib/ai.ts` | Groq requests and JSON parsing |
| `lib/fallback.ts` | Built-in quiz fallback |

## Built With

Next.js, React, TypeScript, and the Groq API.
