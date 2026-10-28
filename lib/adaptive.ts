export type Level = "easy" | "medium" | "hard";
const LEVELS: Level[] = ["easy", "medium", "hard"];

export function nextDifficulty(current: Level, score: number, total: number): Level {
  let i = LEVELS.indexOf(current);
  const ratio = score / total;
  if (ratio >= 0.8) i = Math.min(i + 1, LEVELS.length - 1);
  else if (ratio <= 0.4) i = Math.max(i - 1, 0);
  return LEVELS[i];
}