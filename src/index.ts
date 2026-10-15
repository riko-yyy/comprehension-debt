import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { classify, type Origin } from "./classify.js";
import { listFiles, readCommits } from "./git-log.js";
import { CONFIG_FILE, createIgnore, DEFAULT_IGNORE, loadConfig } from "./ignore.js";
import { DEFAULT_PARAMS, scoreFiles, type ScoreParams } from "./score.js";
import { aggregate, fileHistories } from "./stats.js";

const USAGE = `usage:
  npm run cli -- hello
  npm run cli -- lines <repo-path>                 由来別の変更行数（Phase 1）
  npm run cli -- score <repo-path> [options]       理解スコアの低い順（Phase 2）

options (score):
  --lambda <n>   AI の変更が理解を下げる強さ（既定 ${DEFAULT_PARAMS.lambda}）
  --pair <n>     併走の変更を自律の何倍で効かせるか、0〜1（既定 ${DEFAULT_PARAMS.pairWeight}）`;

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
    const histories = load(repoPath);
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
    const histories = load(repoPath);
    console.log(`params: lambda=${params.lambda} pair=${params.pairWeight}\n`);
    const scores = scoreFiles(histories, params);
    scores.sort((a, b) => a.score - b.score || b.size - a.size);
    printTable(
      ["score", "行数", "自律", "併走", "人間", "最後に人間", "path"],
      scores.map((r) => [
        r.score.toFixed(2),
        String(r.size),
        String(r.lines.autonomous),
        String(r.lines.pair),
        String(r.lines.human),
        r.lastHumanDate?.slice(0, 10) ?? "-",
        r.path,
      ]),
    );
    break;
  }

  default:
    console.log(USAGE);
    process.exit(command ? 1 : 0);
}

// "--lambda 2" のような「名前 値」の組を読む。名前のない最初の引数をリポジトリのパスとみなす
function parseArgs(args: string[]): { repoPath: string; params: ScoreParams } {
  const params = { ...DEFAULT_PARAMS };
  let target: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--lambda" || arg === "--pair") {
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
  if (!target) fail("リポジトリのパスが必要です");
  const repoPath = resolve(target);
  if (!existsSync(resolve(repoPath, ".git"))) fail(`git リポジトリではありません: ${repoPath}`);
  return { repoPath, params };
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
  const config = loadConfigOrFail(repoPath);
  const isIgnored = createIgnore([...DEFAULT_IGNORE, ...config.ignore]);
  const files = [...listFiles(repoPath)];
  const kept = files.filter((f) => !isIgnored(f));
  console.log(`除外: ${files.length - kept.length} ファイル（既定のパターン + ${CONFIG_FILE} の ignore:）\n`);
  return fileHistories(commits, new Set(kept));
}

function loadConfigOrFail(repoPath: string) {
  try {
    return loadConfig(repoPath);
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
