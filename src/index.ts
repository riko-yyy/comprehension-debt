import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { ACKS_FILE, appendAcks, normalizeAckPath, readAcks, type Ack } from "./acks.js";
import { classify, type Origin } from "./classify.js";
import { listFiles, readCommits } from "./git-log.js";
import { NON_CORE_IMPORTANCE, rankDanger, WINDOW_DAYS } from "./danger.js";
import { CONFIG_FILE, createIgnore, DEFAULT_IGNORE, loadConfig } from "./ignore.js";
import { buildReport, renderHtml } from "./report.js";
import { DEFAULT_PARAMS, scoreFiles, type ScoreParams } from "./score.js";
import { aggregate, fileHistories, type Change } from "./stats.js";

const USAGE = `usage:
  npm run cli -- hello
  npm run cli -- lines <repo-path>                 由来別の変更行数（Phase 1）
  npm run cli -- score <repo-path> [options]       理解スコアの低い順（Phase 2）
  npm run cli -- danger <repo-path> [options]      危険地帯の上位10件（Phase 4）
  npm run cli -- report <repo-path> [options]      JSON とツリーマップの HTML を書き出す（Phase 5）
  npm run cli -- ack <repo-path> <path>...         読んで理解したファイル／ディレクトリを記録する

options (score, danger, report):
  --lambda <n>   AI の変更が理解を下げる強さ（既定 ${DEFAULT_PARAMS.lambda}）
  --pair <n>     併走の変更を自律の何倍で効かせるか、0〜1（既定 ${DEFAULT_PARAMS.pairWeight}）
options (report):
  --out <dir>    書き出す先（既定 out）`;

// `| head` のように読み手が途中で閉じたら、エラーにせず静かに終わる
process.stdout.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EPIPE") process.exit(0);
  throw e;
});

// process.argv = [node, script, ...実際の引数]
const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "hello":
    console.log("hello from comprehension-debt");
    break;

  case "lines": {
    const { repoPath } = parseArgs(args);
    const { histories } = load(repoPath);
    const stats = aggregate(histories);
    stats.sort((a, b) => b.lines.autonomous - a.lines.autonomous || b.lines.pair - a.lines.pair);
    printTable(
      ["自律", "併走", "人間", "commits", "path"],
      stats.map((r) => [r.lines.autonomous, r.lines.pair, r.lines.human, r.commits, r.path].map(String)),
    );
    break;
  }

  case "score": {
    const { repoPath, params } = parseArgs(args);
    const { histories } = load(repoPath);
    const scores = loadScores(repoPath, histories, params);
    scores.sort((a, b) => a.score - b.score || b.size - a.size);
    printTable(
      ["score", "行数", "自律", "併走", "人間", "最後の理解", "path"],
      scores.map((r) => [
        r.score.toFixed(2),
        String(r.size),
        String(r.lines.autonomous),
        String(r.lines.pair),
        String(r.lines.human),
        r.lastUnderstoodDate?.slice(0, 10) ?? "-",
        r.path,
      ]),
    );
    break;
  }

  case "danger": {
    const { repoPath, params } = parseArgs(args);
    const { histories, config } = load(repoPath);
    const scores = loadScores(repoPath, histories, params);
    if (config.core.length === 0) {
      console.log(`注意: ${CONFIG_FILE} に core: がないので、すべてのファイルを重要度 1 として扱います\n`);
    }
    const rows = rankDanger(scores, histories, config.core, new Date())
      .filter((r) => r.danger > 0)
      .sort((a, b) => b.danger - a.danger)
      .slice(0, 10);
    if (rows.length === 0) {
      console.log(`直近${WINDOW_DAYS}日に変更されたファイルがないか、すべて理解済みです`);
      break;
    }
    console.log(`危険度 = 重要度（core 1 / それ以外 ${NON_CORE_IMPORTANCE}）× (1 − score) × 変更頻度（直近${WINDOW_DAYS}日）\n`);
    printTable(
      ["危険度", "score", "core", `${WINDOW_DAYS}日`, "path"],
      rows.map((r) => [
        r.danger.toFixed(2),
        r.score.toFixed(2),
        r.core === undefined ? "-" : r.core ? "yes" : "no",
        String(r.recentChanges),
        r.path,
      ]),
    );
    break;
  }

  case "report": {
    const { repoPath, params, outDir } = parseArgs(args);
    const { histories, config } = load(repoPath);
    const scores = loadScores(repoPath, histories, params);
    const dangers = rankDanger(scores, histories, config.core, new Date());
    const report = buildReport(basename(repoPath), params, scores, dangers);

    mkdirSync(outDir, { recursive: true });
    const jsonPath = resolve(outDir, "report.json");
    const htmlPath = resolve(outDir, "index.html");
    writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");
    writeFileSync(htmlPath, renderHtml(report));
    console.log(`${report.files.length} ファイルを書き出しました`);
    console.log(`  ${relative(process.cwd(), jsonPath)}`);
    console.log(`  ${relative(process.cwd(), htmlPath)}（ブラウザで開く）`);
    break;
  }

  case "ack": {
    const [target, ...rawPaths] = args;
    const repoPath = repoPathOrFail(target);
    if (rawPaths.length === 0) fail("理解したファイルかディレクトリのパスが必要です");

    // 打ち間違いを防ぐため、HEAD にあるファイルか、それを含むディレクトリだけを受け付ける
    const files = [...listFiles(repoPath)];
    const paths = rawPaths.map(normalizeAckPath);
    for (const [i, path] of paths.entries()) {
      const exists = path === "" || files.some((f) => f === path || f.startsWith(path + "/"));
      if (!exists) fail(`リポジトリにないパスです: ${rawPaths[i]}`);
    }

    const by = gitUserName(repoPath);
    const date = localIsoString(new Date());
    const acks: Ack[] = paths.map((path) => ({ path, date, by }));
    appendAcks(repoPath, acks);
    for (const a of acks) console.log(`ack: ${a.path || "(リポジトリ全体)"}`);
    console.log(`\n${ACKS_FILE} に ${acks.length} 件追記しました（by ${by}）。対象リポジトリでコミットしてください`);
    break;
  }

  default:
    console.log(USAGE);
    process.exit(command ? 1 : 0);
}

// "--lambda 2" のような「名前 値」の組を読む。名前のない最初の引数をリポジトリのパスとみなす
function parseArgs(args: string[]): { repoPath: string; params: ScoreParams; outDir: string } {
  const params = { ...DEFAULT_PARAMS };
  let target: string | undefined;
  let outDir = "out";
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--out") {
      outDir = args[++i] ?? fail("--out には書き出す先のディレクトリが必要です");
    } else if (arg === "--lambda" || arg === "--pair") {
      const value = Number(args[++i]);
      if (!Number.isFinite(value) || value < 0) fail(`${arg} には 0 以上の数値が必要です`);
      if (arg === "--lambda") params.lambda = value;
      else params.pairWeight = value;
    } else if (arg.startsWith("--")) {
      fail(`知らないオプションです: ${arg}`);
    } else {
      target = arg;
    }
  }
  return { repoPath: repoPathOrFail(target), params, outDir: resolve(outDir) };
}

function repoPathOrFail(target: string | undefined): string {
  if (!target) fail("リポジトリのパスが必要です");
  const repoPath = resolve(target);
  if (!existsSync(resolve(repoPath, ".git"))) fail(`git リポジトリではありません: ${repoPath}`);
  return repoPath;
}

// git log の %aI と同じ、タイムゾーン付きのローカル時刻（2026-10-15T22:10:00+09:00）
function localIsoString(d: Date): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const offset = -d.getTimezoneOffset();
  const tz = `${offset >= 0 ? "+" : "-"}${pad(offset / 60)}:${pad(offset % 60)}`;
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${tz}`
  );
}

function gitUserName(repoPath: string): string {
  try {
    return execFileSync("git", ["-C", repoPath, "config", "user.name"], { encoding: "utf8" }).trim();
  } catch {
    fail("git の user.name が設定されていません（git config user.name で設定してください）");
  }
}

function fail(message: string): never {
  console.error(`error: ${message}\n\n${USAGE}`);
  process.exit(1);
}

function load(repoPath: string) {
  console.log(`target: ${repoPath}`);
  const commits = readCommits(repoPath);
  const count = (origin: Origin) => commits.filter((c) => classify(c).origin === origin).length;
  console.log(
    `commits: ${commits.length}（自律 ${count("autonomous")} / 併走 ${count("pair")} / 人間 ${count("human")}、マージコミットを除く）`,
  );

  // 既定の除外のあとに understanding.yml の ignore: を並べるので、"!" で既定を取り消せる
  const config = orFail(() => loadConfig(repoPath));
  const isIgnored = createIgnore([...DEFAULT_IGNORE, ...config.ignore]);
  const files = [...listFiles(repoPath)];
  const kept = files.filter((f) => !isIgnored(f));
  console.log(`除外: ${files.length - kept.length} ファイル（既定のパターン + ${CONFIG_FILE} の ignore:）\n`);
  return { histories: fileHistories(commits, new Set(kept)), config };
}

function loadScores(repoPath: string, histories: Map<string, Change[]>, params: ScoreParams) {
  const acks = orFail(() => readAcks(repoPath));
  console.log(`acks: ${acks.length} 件（${ACKS_FILE}）`);
  console.log(`params: lambda=${params.lambda} pair=${params.pairWeight}\n`);
  return scoreFiles(histories, acks, params);
}

// 設定ファイルなどの読み込みエラーを、使い方つきのエラー表示にする
function orFail<T>(read: () => T): T {
  try {
    return read();
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

// 最後の列（path）以外を右寄せにして表を出す
function printTable(header: string[], body: string[][]) {
  // 日本語は表示幅が2なので、padStart では揃わない
  const width = (s: string) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0);
  const cols = header.length - 1;
  const widths = Array.from({ length: cols }, (_, i) =>
    Math.max(...[header, ...body].map((row) => width(row[i]))),
  );
  for (const row of [header, ...body]) {
    const cells = row.slice(0, cols).map((cell, i) => " ".repeat(widths[i] - width(cell)) + cell);
    console.log([...cells, row[cols]].join("  "));
  }
}
