type Question = { question: string; options: string[]; answer: number; concept: string };

export const FALLBACK_QUIZ: Question[] = [
  { question: "What does range(3) produce?", options: ["0, 1, 2", "1, 2, 3", "0, 1, 2, 3", "3"], answer: 0, concept: "range()" },
  { question: "Which keyword starts a loop over a list?", options: ["while", "for", "loop", "repeat"], answer: 1, concept: "for loops" },
  { question: "When does a while loop stop?", options: ["After one pass", "When its condition becomes False", "Never", "After 10 passes"], answer: 1, concept: "while loops" },
  { question: "What does break do inside a loop?", options: ["Skips one pass", "Restarts the loop", "Exits the loop immediately", "Prints a message"], answer: 2, concept: "break and continue" },
  { question: "How many times does the inner body run for 3 outer and 2 inner passes?", options: ["5", "6", "3", "2"], answer: 1, concept: "nested loops" },
];

export function fallbackLesson(concept: string) {
  return {
    lesson: `The AI tutor could not be reached, so here is a quick practice set to keep you moving. Focus area: ${concept}.`,
    practice: FALLBACK_QUIZ.slice(0, 3).map((q) => ({ ...q, concept })),
  };
}
