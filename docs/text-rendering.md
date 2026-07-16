# 文字入れ・画像生成の仕様

概要は [README](../README.md) にも記載。ここでは実装上の不変条件を集約する。

## 文字配置
- **位置が上/下（横書き）**: 左揃え、画像幅に収まらない場合は改行。
- **位置が左/右（縦書き）**: 上揃え、画像高さに収まらない場合は次の列へ（右から左）。
- 縦書き時は句読点・括弧の回転処理あり。

## フォントサイズ
- 画像の短辺基準で自動計算（横書き・縦書き共通）。基準 `Math.min(width, height) / 14`（約14文字）、下限14px・上限500px。
- サイズ係数: 小(0.75) / 中(1.0) / 大(1.4) / 特大(2.35)

## 文字の影
- 視認性のため全文字に影を追加。薄い色（白・緑・黄・桃・橙）→黒影、濃い色（赤・青・茶）→白影。

## 画像の取り扱い
- 生成画像はBlobURLで一時表示し離脱時に破棄。生成後のオプション変更で「再生成」ボタン有効化。「最初からやり直す」で全リセット。

## EXIF/メタデータ
- Orientationに従い自動回転（スマホ画像対応）。GPS・カメラ情報等は出力時に削除（プライバシー保護）。
- **撮影情報のオプトイン保存**（`cameraOption`: `none`/`show`/`detail`）。`show`=カメラのメーカー名・機種名のみ、`detail`=加えてF値・シャッター速度・ISO・焦点距離(+35mm換算)・レンズ名・露出補正・フラッシュを `Image.exifDetails`（JSON）へ保存。撮影日時・撮影方向（GPS方位）は取得しない。抽出は [parser.ts](../src/lib/exif/parser.ts)（`extractExif(input, {detail})`）、整形/サニタイズは [details.ts](../src/lib/exif/details.ts)。詳細ページでは機種名クリックでモーダル表示（`ExifDetailModal`）。

## 代替テキスト（ALT）
画像の代替テキスト。`text` と同じ経路に `altText` を1本通す配管（`PublishImageInput.altText` → `PostImageInput` → [post.ts](../src/lib/fediverse/post.ts)）。DBは `Image.altText`（VarChar1500・null=未設定）。
- **投稿先**: Mastodon=メディアの `description`／Misskey=ドライブの `comment`（**512字上限で切り詰め**）。未設定なら送らない。
- **Web**: [ImageUpload.tsx](../src/components/ImageUpload.tsx) の画像左上「ALT」バッジ（Mastodon風）→ [AltTextDialog.tsx](../src/components/AltTextDialog.tsx) で入力。生成には不要なので `/api/v1/generate` には送らず `/api/v1/post` の FormData にのみ相乗り。画像を変えたら破棄。上限1500字。
- **Bot（mention）**: 元投稿の添付メディアの `description` をそのまま引き継ぐ（[processor.ts](../src/lib/mention/processor.ts)）。**メール投稿は非対応**。
- **サービス側 `<img>`**: 主画像の alt は `altText || overlayText`（ALT未設定なら合成テキストにフォールバック）。装飾サムネ（`alt=""`）は対象外。
