// targets.yml の対象ごとにレポートを作り、一覧ページと一緒に site/ に書き出す（ADR 0014）
// 使い方: npm run site。GitHub Actions（.github/workflows/report.yml）も同じものを動かす
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import type { Report } from "../src/report.js";

const SITE_DIR = resolve("site");
const TARGETS_FILE = "targets.yml";

type Target = { name: string; repo: string };

function loadTargets(): Target[] {
  const doc = parse(readFileSync(TARGETS_FILE, "utf8")) as { targets?: Partial<Target>[] } | null;
  const targets = doc?.targets ?? [];
  if (targets.length === 0) throw new Error(`${TARGETS_FILE} に targets: がありません`);
  return targets.map((t, i) => {
    // name はディレクトリ名と URL になるので、パスとして危ない文字を入れない
    if (typeof t.name !== "string" || !/^[\w.-]+$/.test(t.name) || t.name.startsWith(".")) {
      throw new Error(`${TARGETS_FILE} の ${i + 1} 件目: name は英数字・"-"・"_"・"." だけにしてください`);
    }
    if (typeof t.repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(t.repo)) {
      throw new Error(`${TARGETS_FILE} の ${i + 1} 件目: repo は owner/name の形にしてください`);
    }
    return { name: t.name, repo: t.repo };
  });
}

const targets = loadTargets();
const work = mkdtempSync(join(tmpdir(), "comprehension-debt-"));
rmSync(SITE_DIR, { recursive: true, force: true });

try {
  for (const t of targets) {
    console.log(`\n== ${t.name}（${t.repo}）`);
    // git clone は既定で全履歴を取る。行数を履歴の積み上げで推定するので、浅い clone にしない（ADR 0007）
    const repoPath = join(work, t.name);
    execFileSync("git", ["clone", "--quiet", `https://github.com/${t.repo}.git`, repoPath], { stdio: "inherit" });
    execFileSync("npm", ["run", "-s", "cli", "--", "report", repoPath, "--out", join(SITE_DIR, t.name)], {
      stdio: "inherit",
    });
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

const reports = targets.map((t) => ({
  target: t,
  report: JSON.parse(readFileSync(join(SITE_DIR, t.name, "report.json"), "utf8")) as Report,
}));
writeFileSync(join(SITE_DIR, "index.html"), renderIndex(reports));
console.log(`\n${targets.length} 件のレポートと site/index.html を書き出しました`);

function renderIndex(items: { target: Target; report: Report }[]): string {
  const rows = items
    .map(({ target, report }) => {
      const top = [...report.files].sort((a, b) => b.danger - a.danger)[0];
      const topCell = top && top.danger > 0 ? `${escapeHtml(top.path)}（${top.danger.toFixed(2)}）` : "なし";
      return `<tr>
  <td><a href="${target.name}/">${escapeHtml(target.name)}</a></td>
  <td class="num">${report.files.length}</td>
  <td class="path">${topCell}</td>
  <td><a href="https://github.com/${target.repo}">${escapeHtml(target.repo)}</a></td>
</tr>`;
    })
    .join("\n");
  const generatedAt = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>理解スコアの一覧</title>
<style>
  :root { --bg: #fff; --fg: #1f1f1f; --muted: #6b6b6b; --line: #e3e3e3; --link: #1f5fa8; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #161616; --fg: #e8e8e8; --muted: #a0a0a0; --line: #333; --link: #7fb2ec; }
  }
  body { margin: 0; padding: 24px 16px; background: var(--bg); color: var(--fg); font-family: system-ui, sans-serif; }
  main { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 20px; font-weight: 600; }
  p { color: var(--muted); font-size: 14px; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  th { color: var(--muted); font-weight: 500; }
  .num { text-align: right; }
  .path { white-space: normal; word-break: break-all; }
  a { color: var(--link); }
</style>
</head>
<body>
<main>
<h1>理解スコアの一覧</h1>
<p>危険度 = 重要度 × (1 − 理解スコア) × 変更頻度。更新: ${escapeHtml(generatedAt)}</p>
<div class="scroll">
<table>
<thead><tr><th>リポジトリ</th><th class="num">ファイル数</th><th>危険度の1位</th><th>GitHub</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>
</main>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
