import { existsSync } from "node:fs";
import { resolve } from "node:path";

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
    console.log(`target: ${repoPath}`);
    break;
  }

  default:
    console.log(USAGE);
    process.exit(command ? 1 : 0);
}
