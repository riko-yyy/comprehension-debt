import { readFileSync } from "node:fs";
import type { Origin } from "./classify.js";
import type { DangerRow } from "./danger.js";
import type { FileScore, ScoreParams } from "./score.js";

// out/report.json の形（ADR 0012）。形を変えるときは ADR を足す
export type Report = {
  repo: string;
  generatedAt: string;
  params: ScoreParams;
  files: ReportFile[];
};

export type ReportFile = {
  path: string;
  score: number;
  danger: number;
  // core に一致したか。core: が未設定なら null
  core: boolean | null;
  size: number;
  recentChanges: number;
  lines: Record<Origin, number>;
  lastUnderstoodDate: string | null;
  // 理解するための材料（ADR 0013）。git show <commit> -- <path> で差分を取り出せる
  changesSinceUnderstood: { commit: string; date: string; origin: Origin; added: number; deleted: number }[];
};

export function buildReport(repo: string, params: ScoreParams, scores: FileScore[], dangers: DangerRow[]): Report {
  const dangerOf = new Map(dangers.map((d) => [d.path, d]));
  const round = (n: number) => Math.round(n * 1000) / 1000;

  return {
    repo,
    generatedAt: new Date().toISOString(),
    params,
    files: scores
      .map((s) => {
        const d = dangerOf.get(s.path);
        return {
          path: s.path,
          score: round(s.score),
          danger: round(d?.danger ?? 0),
          core: d?.core ?? null,
          size: s.size,
          recentChanges: d?.recentChanges ?? 0,
          lines: s.lines,
          lastUnderstoodDate: s.lastUnderstoodDate ?? null,
          changesSinceUnderstood: s.changesSinceUnderstood.map(({ commit, date, origin, added, deleted }) => ({
            commit,
            date,
            origin,
            added,
            deleted,
          })),
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path)),
  };
}

// ブラウザはローカルで開いた HTML から別ファイルの JSON を読めないので、HTML の中に埋め込む
export function renderHtml(report: Report): string {
  const template = readFileSync(new URL("./report-template.html", import.meta.url), "utf8");
  // JSON の中に "</script>" があると script タグが途中で閉じてしまうので、"<" を逃がす
  const json = JSON.stringify(report).replace(/</g, "\\u003c");
  return template.replace("/*__REPORT__*/ null", json).replace("__TITLE__", escapeHtml(report.repo));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
