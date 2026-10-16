# 0012: レポートは JSON と、それを埋め込んだツリーマップの HTML で出す

- 日付: 2026-10-16
- ステータス: 提案

## 背景

Phase 5 では、ターミナルの表ではなく、リポジトリ全体の理解の状態を一目で見られるようにする。
Phase 6 でこれを毎日自動で更新して公開するので、静的なファイルとして出せる必要がある。
また ADR 0010 で、explainer に渡す材料（最後に理解してからの変更）をこのツールが出すと決めた。

## 決定

`npm run cli -- report <repo-path> [--out <dir>]` で、2つのファイルを書き出す（既定は `out/`）。

### out/report.json

```json
{
  "repo": "tekito-uranai",
  "generatedAt": "2026-10-16T...",
  "params": { "lambda": 1, "pairWeight": 0.5 },
  "files": [{
    "path": "src/App.tsx",
    "score": 0.194, "danger": 0.602, "core": null,
    "size": 90, "recentChanges": 5,
    "lines": { "human": 0, "pair": 370, "autonomous": 0 },
    "lastUnderstoodDate": null,
    "changesSinceUnderstood": [
      { "commit": "c87e558...", "date": "...", "origin": "pair", "added": 122, "deleted": 0 }
    ]
  }]
}
```

- `changesSinceUnderstood` は、最後に理解した時点（人間の変更か ack）より後の変更。一度も理解していなければ、作られてからの全部
- `commit` を持つので、`git show <commit...> -- <path>` で差分を取り出し、explainer に渡せる
- `core` は `core:` が未設定なら `null`
- 数値は小数3桁に丸める。形を変えるときは ADR を足す

### out/index.html

- ディレクトリの入れ子を四角の入れ子で描くツリーマップ。面積 = 行数、色 = 理解スコア
- 色は赤（理解していない）〜 青（理解している）。赤〜緑より色覚の違いに強い
- ディレクトリの色（枠）とラベルの数値は、中のファイルのスコアを行数で重み付けした平均
- 横（狭い画面では下）に危険地帯の上位10件。クリックすると、最後に理解してからの変更の一覧と、差分を取り出す `git show` のコマンドを出す
- D3 は jsDelivr から読み込む
- JSON は HTML の中に埋め込む。ブラウザはローカルで開いた HTML から別ファイルの JSON を読めないため。`</script>` で閉じないよう `<` は逃がす

## 検討した選択肢

- HTML から `report.json` を fetch で読む — ダブルクリックで開くと動かない。Phase 6 でサーバーに置けば動くが、ローカルで確かめられない
- 色を赤〜緑にする — 赤緑の色覚の違いがあると見分けにくい
- 面積を変更行数や危険度にする — 「今のコードのどれだけが理解されていないか」を見るには、今の行数が素直
- 時系列の変化、絞り込み・検索、画面からの ack、explainer の自動呼び出し — 今回は作らない（Phase 6 以降で必要になったら）

## 結果

HTML 1枚をダブルクリックすれば見られる。Phase 6 では `out/` をそのまま公開すればよい。
D3 を CDN から読むので、オフラインでは表示されない。
JSON を埋め込むので、ファイル数の多いリポジトリでは HTML が大きくなる（手元の最大 86 ファイルで問題なし）。
