# 0003: ツールは comprehension-debt リポジトリで開発する

- 日付: 2026-09-25
- ステータス: 採用

## 背景

当初の計画では、ツール用に `understanding-tool` リポジトリを新しく作る予定だった。
一方、作業を始めた時点ですでに `comprehension-debt` リポジトリ（README のみ）があった。

## 決定

新しいリポジトリは作らず、`comprehension-debt` でツールを開発する。
段階1の中央バッチ（Phase 6 の scheduled workflow）もこのリポジトリに置く。

## 検討した選択肢

- `understanding-tool` を新規作成 — 空のリポジトリがすでにあり、分ける理由がない

## 結果

プロジェクト名（comprehension debt = 理解負債）とツールの目的が一致する。
名前を変えたくなったら、GitHub のリポジトリ名変更で対応できる。
