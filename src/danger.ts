import { createIgnore } from "./ignore.js";
import type { FileScore } from "./score.js";
import type { Change } from "./stats.js";

// core に一致しないファイルの重要度（ADR 0011）
export const NON_CORE_IMPORTANCE = 0.3;
// 変更頻度を数える期間
export const WINDOW_DAYS = 90;

export type DangerRow = {
  path: string;
  danger: number;
  score: number;
  // core に一致したか。core: が未設定なら undefined
  core?: boolean;
  importance: number;
  // 直近 WINDOW_DAYS 日の変更回数
  recentChanges: number;
};

// 危険度 = 重要度 × (1 − 理解スコア) × 変更頻度（ADR 0011）
export function rankDanger(
  scores: FileScore[],
  histories: Map<string, Change[]>,
  core: string[],
  now: Date,
): DangerRow[] {
  // core: は ignore: と同じ書き方。「一致したら除外」の判定を「一致したら core」に読み替える
  const isCore = core.length > 0 ? createIgnore(core) : undefined;
  const since = now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const recent = (path: string) =>
    (histories.get(path) ?? []).filter((c) => Date.parse(c.date) >= since).length;

  const counts = scores.map((s) => recent(s.path));
  // 回数の多いファイルが極端に強くならないよう、対数で縮めてから最大を 1 にする
  const maxLog = Math.log1p(Math.max(0, ...counts));

  return scores.map((s, i) => {
    const core = isCore?.(s.path);
    const importance = core === false ? NON_CORE_IMPORTANCE : 1;
    const frequency = maxLog === 0 ? 0 : Math.log1p(counts[i]) / maxLog;
    return {
      path: s.path,
      danger: importance * (1 - s.score) * frequency,
      score: s.score,
      core,
      importance,
      recentChanges: counts[i],
    };
  });
}
