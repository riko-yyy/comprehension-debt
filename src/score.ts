import { ackCovers, type Ack } from "./acks.js";
import type { Origin } from "./classify.js";
import type { Change } from "./stats.js";

export type ScoreParams = {
  // AI の変更がどれだけ強く理解を下げるか（ADR 0007）
  lambda: number;
  // 併走の変更を、自律の変更の何倍として効かせるか。0 = 理解を下げない、1 = 自律と同じ
  pairWeight: number;
};

export const DEFAULT_PARAMS: ScoreParams = { lambda: 1, pairWeight: 0.5 };

export type FileScore = {
  path: string;
  // 0〜1。1 = 人間が全部理解している
  score: number;
  // 履歴から推定した今の行数
  size: number;
  lines: Record<Origin, number>;
  commits: number;
  // 最後に理解した日時。人間の変更か ack の新しいほう
  lastUnderstoodDate?: string;
  lastDate: string;
};

// 履歴を古い順に再生して、理解度を更新していく（ADR 0007）
//   人間の変更: 変更した割合だけ、理解していない部分を埋める
//   AI の変更:  変更した割合に応じて、理解度を指数的に下げる
//   ack:        ファイル全体を読んだという申告なので、満点に戻す（ADR 0009）
// acks はこのファイルに当てはまるものを渡す
export function scoreFile(path: string, changes: Change[], acks: Ack[], params: ScoreParams): FileScore {
  const weight: Record<Origin, number> = { human: 0, pair: params.pairWeight, autonomous: 1 };
  const lines: Record<Origin, number> = { human: 0, pair: 0, autonomous: 0 };
  // まだ存在しないファイルは、理解すべきものがないので 1 から始める
  let understood = 1;
  let size = 0;
  let lastUnderstoodDate: string | undefined;

  // ack を日時の順に、その日時より後の変更の手前で差し込む
  const pending = [...acks].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const applyAcksBefore = (date: number) => {
    while (pending.length > 0 && Date.parse(pending[0].date) <= date) {
      understood = 1;
      lastUnderstoodDate = pending.shift()!.date;
    }
  };

  for (const c of changes) {
    applyAcksBefore(Date.parse(c.date) - 1);
    const touched = c.added + c.deleted;
    const before = size;
    size = Math.max(0, size + c.added - c.deleted);
    // 削除が多いと変更後の行数が小さくなり割合が跳ねるので、前後の大きい方で割る
    const ratio = touched / Math.max(before, size, 1);

    if (c.origin === "human") {
      understood += (1 - understood) * Math.min(1, ratio);
      lastUnderstoodDate = c.date;
    } else {
      understood *= Math.exp(-params.lambda * weight[c.origin] * ratio);
    }
    lines[c.origin] += touched;
  }
  applyAcksBefore(Infinity);

  return {
    path,
    score: understood,
    size,
    lines,
    commits: changes.length,
    lastUnderstoodDate,
    lastDate: changes.at(-1)?.date ?? "",
  };
}

export function scoreFiles(histories: Map<string, Change[]>, acks: Ack[], params: ScoreParams): FileScore[] {
  return [...histories].map(([path, changes]) =>
    scoreFile(path, changes, acks.filter((a) => ackCovers(a, path)), params),
  );
}
