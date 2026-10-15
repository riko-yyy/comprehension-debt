# 0008: 理解の対象ではないファイルを、既定のパターンと understanding.yml で除外する

- 日付: 2026-10-15
- ステータス: 提案

## 背景

Phase 2 のスコアを手元の5つのリポジトリで出すと、理解の対象ではないファイルがスコアの低い側に並んでいた。

- `tekito-uranai`: `public/favicon.svg` が最下位（0.13）。`package-lock.json` も8位
- `aws-dotnet-lab`: `.terraform.lock.hcl` ×2、EF Core のマイグレーション（`*.Designer.cs`、`*ModelSnapshot.cs`）
- `ddd-dojo`、`comprehension-debt`: `package-lock.json`（1000行前後）

これらは人間が読んで理解するものではなく、危険地帯（Phase 4）の邪魔になる。

## 決定

- ツールに既定の除外パターンを持つ（`src/ignore.ts` の `DEFAULT_IGNORE`）
  - lock ファイル（`package-lock.json`、`yarn.lock`、`go.sum`、`.terraform.lock.hcl` など）
  - 自動生成ファイル（`*.min.js`、`*.min.css`、`*.map`、`*.snap`、`*.Designer.cs`、`*ModelSnapshot.cs`）
  - `*.svg`（ほかの画像形式はバイナリなので、もともと集計されない）
- 対象リポジトリのルートにある `understanding.yml` の `ignore:` で、パターンを足せる
  - 既定のパターンの後ろに並べて、`.gitignore` と同じく最後に一致したものが勝つ。`!` で既定の除外を取り消せる（例: `!docs/*.svg`）
  - `/` を含まないパターンはファイル名だけに当てる。`dist/` のように `/` で終わるものは、その名前のディレクトリの中身すべて
  - このファイルは Phase 4 の `core:` でも使う
- 除外は履歴を集計する前に行い、`lines` と `score` のどちらにも出さない。出力の先頭に除外した件数を出す
- パターンの判定には `picomatch`、YAML の読み込みには `yaml` を使う

## 検討した選択肢

- 除外を設定ファイルだけに任せる（既定なし） — lock ファイルはほぼ全員が除外したいので、毎回書かせるのは手間
- 既定だけで、上書きできない — 手書きの SVG 図など、理解しておきたいものを戻せない
- `.gitattributes` の `linguist-generated` を読む — GitHub 公式の印だが、手元のリポジトリでは使われていない。必要になったら足す
- Node.js 組み込みの `path.matchesGlob` — Node 20 を前提に picomatch を選んだが、手元は Node 24 に上がっていた。
  それでも、ファイル名だけに当てる挙動（`.gitignore` 風）を自分で書く量は変わらず、GitHub Actions 側の Node のバージョンにも縛られないので picomatch のままにする

## 結果

lock ファイルや SVG が危険地帯の候補から消える。
既定のパターンは、言語やフレームワークが増えるたびに足していく必要がある。
.NET 専用のパターン（EF Core のマイグレーション）を既定に入れたので、既定の一覧はやや手元のリポジトリ寄りになっている。
