import { classify, type Origin } from "./classify.js";
import type { Commit } from "./git-log.js";

// 1つのファイルに対する1回の変更
export type Change = {
  // コミットのハッシュ。git show <commit> -- <path> で、そのときの差分を取り出せる
  commit: string;
  date: string;
  origin: Origin;
  added: number;
  deleted: number;
};

export type FileStats = {
  path: string;
  // 由来ごとの変更行数（追加 + 削除）
  lines: Record<Origin, number>;
  commits: number;
};

// ファイルごとの変更履歴を、古い順に並べて返す。
// commits は新しい順で渡すこと。リネーム前の変更も、今のパスにまとめる
export function fileHistories(commits: Commit[], currentFiles: Set<string>): Map<string, Change[]> {
  // 古いパス → 今のパス
  const renamedTo = new Map<string, string>();
  const current = (path: string) => renamedTo.get(path) ?? path;
  const histories = new Map<string, Change[]>();

  for (const commit of commits) {
    const { origin } = classify(commit);
    for (const file of commit.files) {
      const path = current(file.path);
      // 新しい順に見ているので、ここで登録した対応は、より古いコミットに効く
      if (file.oldPath) renamedTo.set(file.oldPath, path);
      if (file.binary || !currentFiles.has(path)) continue;

      const list = histories.get(path) ?? [];
      list.push({ commit: commit.hash, date: commit.date, origin, added: file.added, deleted: file.deleted });
      histories.set(path, list);
    }
  }
  // 新しい順に積んだので、古い順に直す
  for (const list of histories.values()) list.reverse();
  return histories;
}

// ファイルごとに由来別の変更行数を集計する
export function aggregate(histories: Map<string, Change[]>): FileStats[] {
  return [...histories].map(([path, changes]) => {
    const lines: Record<Origin, number> = { human: 0, pair: 0, autonomous: 0 };
    for (const c of changes) lines[c.origin] += c.added + c.deleted;
    return { path, lines, commits: changes.length };
  });
}
