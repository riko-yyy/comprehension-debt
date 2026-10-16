import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import picomatch from "picomatch";
import { parse } from "yaml";

// 理解の対象ではないので、既定でスコアから外すファイル（ADR 0008）
export const DEFAULT_IGNORE = [
  // lock ファイル
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "Cargo.lock",
  "poetry.lock",
  "uv.lock",
  "Pipfile.lock",
  "Gemfile.lock",
  "composer.lock",
  "go.sum",
  "packages.lock.json",
  ".terraform.lock.hcl",
  // 自動生成ファイル
  "*.min.js",
  "*.min.css",
  "*.map",
  "*.snap",
  "*.Designer.cs",
  "*ModelSnapshot.cs",
  // 画像（ほかの形式はバイナリなので、もともと集計されない）
  "*.svg",
  // このツール自身の記録（ADR 0009）
  "/.understanding/",
];

export const CONFIG_FILE = "understanding.yml";

export type Config = {
  ignore: string[];
  // 重要なパス（ADR 0011）。書き方は ignore: と同じ
  core: string[];
};

// 対象リポジトリの understanding.yml を読む。なければ空の設定
export function loadConfig(repoPath: string): Config {
  const file = resolve(repoPath, CONFIG_FILE);
  if (!existsSync(file)) return { ignore: [], core: [] };

  const raw = (parse(readFileSync(file, "utf8")) ?? {}) as Record<string, unknown>;
  return { ignore: patternList(raw, "ignore"), core: patternList(raw, "core") };
}

function patternList(raw: Record<string, unknown>, key: string): string[] {
  const value = raw[key] ?? [];
  if (!Array.isArray(value) || !value.every((p) => typeof p === "string")) {
    throw new Error(`${CONFIG_FILE} の ${key}: は文字列のリストにしてください`);
  }
  return value;
}

// .gitignore と同じように、パターンを上から順に当てて最後に一致したものが勝つ。
// "!" で始まるパターンは除外を取り消す。"/" を含まないパターンはファイル名だけに当てる
export function createIgnore(patterns: string[]): (path: string) => boolean {
  const rules = patterns.map((pattern) => {
    const negate = pattern.startsWith("!");
    let glob = negate ? pattern.slice(1) : pattern;
    // "/docs/*.md" のように先頭の "/" はリポジトリのルートからという意味。パスは "/" で始まらないので外す
    const anchored = glob.startsWith("/");
    if (anchored) glob = glob.slice(1);
    // "dist/" のように "/" で終わるものは、その名前のディレクトリの中身すべて（"/dist/" ならルートの dist だけ）
    if (glob.endsWith("/")) glob = anchored ? `${glob}**` : `**/${glob}**`;
    // picomatch の basename オプションは "/" を含むパターンにも効いてしまうので、ここで分ける
    const basename = !pattern.includes("/");
    return { negate, match: picomatch(glob, { basename, dot: true }) };
  });

  return (path) => {
    let ignored = false;
    for (const rule of rules) {
      if (rule.match(path)) ignored = !rule.negate;
    }
    return ignored;
  };
}
