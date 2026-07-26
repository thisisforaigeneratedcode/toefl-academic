export const KES_RATE = 129;

export const LEVELS = [
  { code: "A2", name: "Elementary", description: "Routine tasks and familiar topics.", price: 348.837, duration: "10 min" },   // KES 45,000
  { code: "B1", name: "Intermediate", description: "Travel, work, and clear standard input.", price: 139.534, duration: "10 min" },
  { code: "B2", name: "Upper-Intermediate", description: "Complex texts and abstract topics.", price: 503.876, duration: "10 min" },  // KES 65,000
  { code: "C1", name: "Advanced", description: "Fluent and spontaneous expression.", price: 271.318, duration: "10 min" },  // KES 35,000
  { code: "C2", name: "Proficient", description: "Mastery — near-native command.", price: 428.682, duration: "10 min" },
] as const;

export type LevelCode = typeof LEVELS[number]["code"];

export function bandFromScore(score: number, total: number): string {
  const pct = (score / total) * 100;
  if (pct >= 90) return "Distinction";
  if (pct >= 75) return "Pass with Merit";
  if (pct >= 60) return "Pass";
  return "Did Not Pass";
}

export const WRITING_PROMPTS: Record<string, string> = {
  A2: "Write 80–100 words about your last weekend. What did you do? Who were you with?",
  B1: "Write 120–150 words on the topic: 'Living in a big city has more advantages than disadvantages.' Do you agree?",
  B2: "Write 150–200 words on: 'Some people think technology has made us lonelier.' Discuss with examples.",
  C1: "Write 200–250 words discussing whether governments should prioritise economic growth or environmental protection.",
  C2: "Write 250–300 words: 'In an era of misinformation, traditional journalism remains the most reliable source of truth.' Critically evaluate.",
};
