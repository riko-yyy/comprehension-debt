# 0002: TypeScript + tsx で、CLI フレームワークなしで始める

- 日付: 2026-09-25
- ステータス: 採用

## 背景

CLI を作るのは初めて。Phase 0 の目的は「引数を受け取って表示する」感覚をつかむこと。
将来的に GitHub Actions / GitHub App 化（段階2・3）を見据えると、Node.js エコシステムとの相性がよい言語が望ましい。

## 決定

- 言語は TypeScript。実行は tsx（ビルドせずに `.ts` を直接実行）
- 型チェックは実行と分け、`npm run typecheck`（`tsc --noEmit`）で行う
- 引数の解析は `process.argv` を直接読む。commander などのフレームワークは使わない
- 呼び出し口は `npm run cli -- <サブコマンド>`（`package.json` の scripts）に統一する

## 検討した選択肢

- ts-node — 設定（ESM / CommonJS）でつまずきやすい
- Node.js 組み込みの TypeScript 実行 — Node 22.6 以降が必要。手元は Node 20
- tsc でビルドしてから node で実行 — 手順が増え、Phase 0 の目的に対して重い
- commander / yargs — 便利だが、最初は CLI の仕組みそのものを理解したい

## 結果

依存は typescript / tsx / @types/node の3つだけ。
tsx は型チェックをしないため、型エラーがあっても実行できてしまう点に注意する。
サブコマンドやオプションが増えて `switch` が読みにくくなったら、フレームワーク導入を別 ADR で検討する。
