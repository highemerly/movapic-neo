# ドキュメントページの図（プリレンダーSVG）

`/docs` の画像処理フロー図は、mermaid ソースを**ビルド前に一度だけ静的SVGへ変換**し、
`public/diagrams/` に置いて `<img>` で読み込む（実行時mermaid不使用＝CSP `script-src` 非依存）。

- ソース: [pipeline.mmd](pipeline.mmd)
- 出力: `public/diagrams/pipeline-light.svg`（`-t default`）/ `public/diagrams/pipeline-dark.svg`（`-t dark`）
- ページ側はライト/ダークの2枚を Tailwind の `dark:` で出し分ける（テーマは `.dark` クラス方式）。

## 再生成手順

`htmlLabels:false` で純SVG（`<text>`ベース）化するのが重要。foreignObject が残ると
`<img>` 読み込み時にラベルが描画されない。

```sh
# chromium を落とさず、システムの Google Chrome を使う
export PUPPETEER_SKIP_DOWNLOAD=true PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

npx -y @mermaid-js/mermaid-cli@latest \
  -i src/app/docs/_diagrams/pipeline.mmd \
  -o public/diagrams/pipeline-light.svg \
  -t default -b transparent \
  -p src/app/docs/_diagrams/puppeteer.json \
  -c src/app/docs/_diagrams/mermaid-config.json

# ダークは -t dark、-o を pipeline-dark.svg に変えるだけ
```

- [puppeteer.json](puppeteer.json) の `executablePath` は各自の Chrome パスに合わせる
  （macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`）。
- 出力SVGは `background-color: transparent`・`width:100%`・外部参照なし。
- ノード文言や段階を変えたら `pipeline.mmd` を編集して両テーマを再生成すること。
