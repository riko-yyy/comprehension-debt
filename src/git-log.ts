import { execFileSync } from "node:child_process";

export type FileChange = {
  path: string;
  // リネームされた場合の変更前のパス
  oldPath?: string;
  added: number;
  deleted: number;
  // バイナリファイルは numstat で行数が "-" になる
  binary: boolean;
};

export type Commit = {
  hash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  coAuthors: string[];
  files: FileChange[];
};

// コミットの区切りに使う印。ファイルパスに現れない文字列にする
const MARKER = "@@COMMIT@@";
const SEP = "\x1f"; // ASCII の Unit Separator。作者名などに含まれない

const FORMAT = [
  MARKER + "%H",
  "%an",
  "%ae",
  "%aI",
  "%(trailers:key=Co-authored-by,valueonly,separator=%x1e)",
].join(SEP);

function git(repoPath: string, args: string[]): string {
  return execFileSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 512,
  });
}

// 新しい順にコミットを返す。マージコミットは行数が二重に数えられるので除く
export function readCommits(repoPath: string): Commit[] {
  const out = git(repoPath, ["log", "--no-merges", "--numstat", "-M", `--format=${FORMAT}`]);
  const commits: Commit[] = [];

  for (const line of out.split("\n")) {
    if (line.startsWith(MARKER)) {
      const [hash, authorName, authorEmail, date, trailers] = line.slice(MARKER.length).split(SEP);
      commits.push({
        hash,
        authorName,
        authorEmail,
        date,
        coAuthors: trailers ? trailers.split("\x1e").map((s) => s.trim()).filter(Boolean) : [],
        files: [],
      });
    } else if (line.trim() !== "") {
      commits.at(-1)?.files.push(parseNumstat(line));
    }
  }
  return commits;
}

// "12\t3\tpath" の1行を読む
function parseNumstat(line: string): FileChange {
  const [added, deleted, ...rest] = line.split("\t");
  const binary = added === "-";
  const { path, oldPath } = parseRename(rest.join("\t"));
  return {
    path,
    oldPath,
    added: binary ? 0 : Number(added),
    deleted: binary ? 0 : Number(deleted),
    binary,
  };
}

// リネームは "old => new" か "dir/{old => new}/file" の形で出てくる
function parseRename(raw: string): { path: string; oldPath?: string } {
  const braced = raw.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
  if (braced) {
    const [, prefix, from, to, suffix] = braced;
    // "{ => sub}/file" のように片側が空になると "//" ができるので潰す
    const join = (mid: string) => (prefix + mid + suffix).replace(/\/\/+/g, "/");
    return { path: join(to), oldPath: join(from) };
  }
  const plain = raw.split(" => ");
  if (plain.length === 2) return { path: plain[1], oldPath: plain[0] };
  return { path: raw };
}

// HEAD に今あるファイルの一覧
export function listFiles(repoPath: string): Set<string> {
  return new Set(git(repoPath, ["ls-files"]).split("\n").filter(Boolean));
}
