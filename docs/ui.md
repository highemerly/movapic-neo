# UI ガイド

## レスポンシブ（PC/モバイルで別UI）
同一ページで**別レイアウト**を出し分ける。境界は Tailwind `md`（768px）。判定は原則CSSのみ（`md:` と standalone variant）で、ハイドレーション不整合を避ける。

- **コンテナ幅**: ページ本体・ヘッダー内側は `container mx-auto px-4 max-w-6xl` で中央寄せ＋最大幅制限。
- **ヘッダー（[SiteHeader.tsx](../src/components/layout/SiteHeader.tsx)）**: モバイルは通常スクロール、PC（md+・非standalone）だけ `md:sticky md:top-0`。standalone（PWA）は下部ナビが出るため `standalone:md:static` で固定解除。
- **下部フッターナビ（[BottomNav.tsx](../src/components/layout/BottomNav.tsx)）**: モバイル(<768px)は常時表示、PCは非表示（`md:hidden`）。ただし standalone は PC でも表示（`standalone:md:flex`）。**ログイン時のみ描画**（未ログインはヘッダーに導線集約）。`fixed bottom-0`。
- **右レール（AppRail・PCのメニュー、[AppMenu.tsx](../src/components/layout/AppMenu.tsx)）**: PC（md+）は画面右端に折りたたみレールを `fixed right-0` で常駐（既定アイコンのみ幅60px＝`RAIL_COLLAPSED`）。layout.tsx が同幅の右パディング `md:pr-[60px]` を確保して重なりを防ぐ。**幅を変えるなら両者を必ず一致させる**。モバイルではレールを出さずスライドメニュー（Sheet）。
- **投稿導線**: モバイル/standaloneは BottomNav 中央の投稿ボタン、PC非standaloneはヘッダー・右レール経由。
- standalone判定の仕組み・下部メニュー詳細は [features.md](./features.md#pwa対応) 参照。

## ボタンのカラー（primary / brand）
2系統を明確に区別する（定義は [globals.css](../src/app/globals.css)・ライト/ダーク両方あり）。
- **`primary`（neutral 黒/白）**: shadcn Button の既定（`variant="default"` ＝ `bg-primary text-primary-foreground`）。**一般的なボタン・通常操作はこれ**。
- **`brand`（ブランドピンク・ロゴ warm グラデ #FE5196 由来）**: **真の主役CTAだけ**に使う＝下部ナビ中央の投稿ボタン・アクティブタブ・未ログインCTA など。クラスは `bg-brand text-brand-foreground hover:bg-brand/90`。
- brand を通常ボタンに乱用しない（主役CTAが埋もれる）。迷ったら primary。

## 共通セレクター（SegmentControl）
選択トグルは**必ず [SegmentControl.tsx](../src/components/SegmentControl.tsx)**（ピル型・角丸ボックス＋等分ボタン）を使う。同じマークアップを手書き複製しない。
- 用途: 位置/色/サイズ/フォント/アレンジ（[OptionsPanel.tsx](../src/components/OptionsPanel.tsx)）・公開範囲（[VisibilityPicker.tsx](../src/components/VisibilityPicker.tsx)）・撮影情報・コラージュ共有など。
- props で吸収: `size`（"sm"既定／"xs"）・`truncate`（可変長ラベル1行省略）・`optionDisabled`（選択肢ごと個別無効化）。
- 例外: create の「シーズン（おすすめ）」トグルは amber強調＋不等幅で意図的に差別化しており共通化対象外。
- shadcn ネイティブ `ui/select.tsx` は基本使わない（ドロップダウンではなくセグメント選択が本アプリの標準）。

## 画像表示（iOS一過性失敗のリトライ）
iOS Safari はダウンロード/デコード中に一過性で `onError` になり標準の壊れた「？」を出すことがある。原本表示・常駐アバターは**共通ラッパーで自動リトライ**する。用途でコンポーネントを使い分ける:

| 用途 | コンポーネント | 特徴 |
|---|---|---|
| アバター/アイコン等の小画像（ヘッダー・下部ナビ・メニュー） | [RetryImg.tsx](../src/components/RetryImg.tsx) | 裸の `<img>`（ラッパーdivなし）。サイズ/rounded は呼び出し側 className |
| 原本フルサイズ（タイムライン写真・画像詳細の本画像） | [gallery/RetryImage.tsx](../src/components/gallery/RetryImage.tsx) | ラッパーdiv＋placeholder（灰/blur）・aspectRatio 対応 |

共通の挙動・不変条件:
- 失敗時は**同一URLのまま `<img>` を再マウント**（`key=attempt`）し最大2回（`MAX_RETRIES`）再取得。全滅したら「？」ではなく**同じ形の灰色プレースホルダ**を残す。
- **キャッシュバスター（`?r=`）は付けない**。失敗の主因はURLの腐りではなくiOS側の一過性資源不足なので同一URLで張り直せば足り、CDN/プロキシのキャッシュも活かせる（バスターは毎回キャッシュミス＝遅く、クエリ検証つきプロキシでは403/404を招く）。
- `src` 変更時は状態リセット（リスト再利用での取り違え防止）。
- **サムネイルはリトライ不要**（縮小表示はデコードが軽く問題が出ない）。原本を出す箇所だけが対象。
