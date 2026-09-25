import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { classify, type Origin } from "./classify.js";
import { listFiles, readCommits } from "./git-log.js";
import { aggregate, type FileStats } from "./stats.js";

const USAGE = `usage:
  npm run cli -- hello
  npm run cli -- score <repo-path>`;

// process.argv = [node, script, ...実際の引数]
const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "hello":
    console.log("hello from comprehension-debt");
    break;

  case "score": {
    const target = args[0];
    if (!target) {
      console.error("error: score にはリポジトリのパスが必要です\n\n" + USAGE);
      process.exit(1);
    }
    const repoPath = resolve(target);
    if (!existsSync(resolve(repoPath, ".git"))) {
      console.error(`error: git リポジトリではありません: ${repoPath}`);
      process.exit(1);
    }
    console.log(`target: ${repoPath}\n`);

    const commits = readCommits(repoPath);
    const count = (origin: Origin) => commits.filter((c) => classify(c).origin === origin).length;
    console.log(
      `commits: ${commits.length}（自律 ${count("autonomous")} / 併走 ${count("pair")} / 人間 ${count("human")}、マージコミットを除く）\n`,
    );

    const stats = aggregate(commits, listFiles(repoPath));
    stats.sort((a, b) => b.lines.autonomous - a.lines.autonomous || b.lines.pair - a.lines.pair);
    printTable(stats);
    break;
  }

  default:
    console.log(USAGE);
    process.exit(command ? 1 : 0);
}

function printTable(rows: FileStats[]) {
  const header = ["自律", "併走", "人間", "commits", "path"];
  const body = rows.map((r) => [
    String(r.lines.autonomous),
    String(r.lines.pair),
    String(r.lines.human),
    String(r.commits),
    r.path,
  ]);
  // 日本語は表示幅が2なので、padStart では揃わない。数値列は ASCII だけなので問題ない
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
