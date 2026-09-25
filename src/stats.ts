import { classify, type Origin } from "./classify.js";
import type { Commit } from "./git-log.js";

export type FileStats = {
  path: string;
  // 由来ごとの変更行数（追加 + 削除）
  lines: Record<Origin, number>;
  commits: number;
};

// ファイルごとに由来別の変更行数を集計する。
// commits は新しい順で渡すこと。リネーム前の変更も、今のパスに合算する
export function aggregate(commits: Commit[], currentFiles: Set<string>): FileStats[] {
  // 古いパス → 今のパス
  const renamedTo = new Map<string, string>();
  const current = (path: string) => renamedTo.get(path) ?? path;
  const stats = new Map<string, FileStats>();

  for (const commit of commits) {
    const { origin } = classify(commit);
    for (const file of commit.files) {
      const path = current(file.path);
      // 新しい順に見ているので、ここで登録した対応は、より古いコミットに効く
      if (file.oldPath) renamedTo.set(file.oldPath, path);
      if (file.binary || !currentFiles.has(path)) continue;

      const s = stats.get(path) ?? { path, lines: { human: 0, pair: 0, autonomous: 0 }, commits: 0 };
      s.lines[origin] += file.added + file.deleted;
      s.commits += 1;
      stats.set(path, s);
    }
  }
  return [...stats.values()];
}
