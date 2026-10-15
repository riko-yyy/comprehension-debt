import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// 「このファイルは読んで理解した」という自己申告の記録（ADR 0009）
export type Ack = {
  // リポジトリのルートからのパス。ディレクトリなら、その中のファイルすべて
  path: string;
  date: string;
  // 誰が理解したか（git の user.name）。段階1では使わないが、組織層を見るときに要る
  by: string;
};

// 対象リポジトリに置く。1行に1件の JSON（JSON Lines）で、追記していく
export const ACKS_FILE = ".understanding/acks.jsonl";

export function readAcks(repoPath: string): Ack[] {
  const file = resolve(repoPath, ACKS_FILE);
  if (!existsSync(file)) return [];

  return readFileSync(file, "utf8")
    .split("\n")
    .map((line, i) => ({ line: line.trim(), no: i + 1 }))
    .filter(({ line }) => line !== "")
    .map(({ line, no }) => {
      let ack: Partial<Ack>;
      try {
        ack = JSON.parse(line);
      } catch {
        throw new Error(`${ACKS_FILE} の ${no} 行目が JSON として読めません`);
      }
      if (typeof ack.path !== "string" || typeof ack.date !== "string" || Number.isNaN(Date.parse(ack.date))) {
        throw new Error(`${ACKS_FILE} の ${no} 行目に path と date（日時）が必要です`);
      }
      return { path: ack.path, date: ack.date, by: ack.by ?? "" };
    });
}

export function appendAcks(repoPath: string, acks: Ack[]) {
  const file = resolve(repoPath, ACKS_FILE);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, acks.map((a) => JSON.stringify(a) + "\n").join(""));
}

// その ack がファイルに当てはまるか。ディレクトリの ack は、中のファイルすべてに当てはまる
export function ackCovers(ack: Ack, file: string): boolean {
  return ack.path === "" || file === ack.path || file.startsWith(ack.path + "/");
}

// ユーザーが打ったパスを、acks.jsonl に書く形にそろえる（"./src/" → "src"）
export function normalizeAckPath(raw: string): string {
  return raw.replace(/^(\.\/)+/, "").replace(/\/+$/, "").replace(/^\.$/, "");
}
