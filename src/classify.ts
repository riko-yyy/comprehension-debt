import type { Commit } from "./git-log.js";

// human: 人間だけで書いた / pair: 人間が AI と併走して書いた / autonomous: AI が単独で書いた（ADR 0006）
export type Origin = "human" | "pair" | "autonomous";

// 作者名・メールアドレス・Co-authored-by の値に含まれていたら AI とみなす
const AI_PATTERNS: RegExp[] = [
  /\[bot\]/i, // devin-ai-integration[bot] など GitHub App のコミット
  /\bdevin\b/i,
  /\bclaude\b/i,
  /noreply@anthropic\.com/i,
  /\bcopilot\b/i,
  /\bcursor(agent)?\b/i,
];

function isAi(text: string): boolean {
  return AI_PATTERNS.some((p) => p.test(text));
}

export function classify(commit: Commit): { origin: Origin; reason: string } {
  // AI が自分の名前でコミットしている = 人間の手元を離れて動いた
  const author = `${commit.authorName} <${commit.authorEmail}>`;
  if (isAi(author)) return { origin: "autonomous", reason: `author: ${author}` };

  // 人間の名前で、AI が共同作成者 = 人間の手元で一緒に作業した
  const coAuthor = commit.coAuthors.find(isAi);
  if (coAuthor) return { origin: "pair", reason: `co-authored-by: ${coAuthor}` };

  return { origin: "human", reason: "" };
}
