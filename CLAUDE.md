# comprehension-debt

git 履歴と PR レビューから、ファイル／ディレクトリ単位の「理解スコア」と危険地帯を出す CLI。
計画は [docs/plan.md](docs/plan.md)、これまでの意思決定は [docs/adr/](docs/adr/) を参照。

## コマンド

- 実行: `npm run cli -- <サブコマンド>`（例: `npm run cli -- score ../design-doc-repo`）
- 型チェック: `npm run typecheck`（tsx は型チェックしないので、変更後は必ず実行する）

## 進め方

- 意思決定（技術選定・設計・進め方）をしたら `docs/adr/` に ADR を追加する。書式は `docs/adr/0000-template.md`
- main に直接コミットしない。機能単位のブランチで作業する（ADR 0004）
- ユーザーは CLI 開発が初めて。新しい道具や概念を使うときは、何をしているかを短く説明する
