# 投稿機能（メール／Bot）

投稿元は DB の `Image.source` で識別: `web`(🌐 Web投稿) / `email`(📧 メール投稿) / `mention`(🤖 Bot投稿)。
オプション値（位置/色/サイズ/フォント/アレンジ）は [README](../README.md) 参照。

## 公開範囲（Visibility）
| 値 | 表示名 | Fediverse投稿 | サービス保存 | 公開TL表示 |
|----|--------|---------------|--------------|------------|
| `public` | 公開 | 公開投稿 | ✅ | ✅ |
| `unlisted` | 非収載 | 非収載（Misskey: home） | ✅ | ✅ |
| `local` | このサービスのみ | ❌ | ✅ | ✅ |

- Mastodon: `public`/`unlisted` をそのまま使用。Misskey: `unlisted` → `home`（非収載相当）。
- UIラベルは連携先の用語に合わせて出し分ける（`visibilityLabels()` @ [src/types/index.ts](../src/types/index.ts)）。Mastodon は「公開投稿／非収載投稿」、Misskey は「公開／ホーム」（Misskey に「非収載」という公開範囲は無い）。

## 出力形式
**保存形式と送信形式を分ける**。SHAMEZO が保存・表示する画像は例外なく AVIF（`AVIF_MAX_FILE_SIZE` @ [src/types/index.ts](../src/types/index.ts)）で、連携先ごとに変わるのは Fediverse へアップロードするときの形式だけ。

| 連携先 | SHAMEZO の保存物 | Fediverse へ送る形式 |
|---|---|---|
| Mastodon | AVIF | **JPEG（投稿直前に変換）** |
| Misskey | AVIF | AVIF（無変換で保存されるため利点が残る） |

- 判定は [uploadFormat.ts](../src/lib/fediverse/uploadFormat.ts) の `resolveUploadFormat`（純粋ロジック）、変換は compute の `/api/internal/transcode`（sharp が要るため）。変換は `postImageToFediverse`（[publishImage.ts](../src/lib/publish/publishImage.ts)）で1回だけ行い、**web / メール / Bot / 再投稿の4経路すべてがここを通る**。
- 変換結果は保存しない（投稿のたびに作り直す＝保存物と連合先の形式を混ぜない）。再試行時は変換済みバッファを使い回す。
- 変換に失敗したら投稿失敗として扱い、AVIF のまま送るフォールバックはしない（送れば Mastodon 側で必ず 500 になるため）。画像は SHAMEZO に残るので再投稿でやり直せる。
- **Mastodon が AVIF を受け取れない理由（pitfall）**: 4.7.2 がセキュリティ対応で libvips の HEIF ローダーをブロックし、同じローダーが担当する AVIF も読めなくなった。`supported_mime_types` には `image/avif` が残るためアップロードは受理され、変換段で 500 "Error processing thumbnail for uploaded media" になる。もともと Mastodon は AVIF を受け取っても JPEG に変換して保存・配信する（`IMAGE_CONVERTIBLE_MIME_TYPES`）ので、JPEG で送っても連合側に届く画像は変わらない。
- 入力オプションの `output`（`mastodon`/`misskey`/`none`）は DB 列・UI ラベルとしてのみ残り、**生成されるバイト列には影響しない**。
- 例外はカレンダーのコラージュ画像（[calendarCollage.ts](../src/lib/image/calendarCollage.ts)）。`Image` レコードを作らず S3 にも保存しない別系統で、JPEG のまま直接投稿する。

## メール投稿機能
- **Cloudflare Email Worker** (`workers/email-forwarder/`): メールを受信しraw dataをAPIへ転送。
- **パーサー** (`src/lib/email/parser.ts`): 件名→オプション、本文→テキスト、添付→画像。
- **件名オプション**（スペース区切り・日本語キーワード。値は「入力オプション」表に対応）:
  - 位置: 上/下/左/右 ・ 色: 白/赤/青/緑/黄/茶/桃/橙 ・ サイズ: 小/中/大/特大 ・ フォント: ふい字/ゴシック/ラノベ ・ アレンジ: ネオン/ハンコ
  - 公開範囲: public/unlisted（localは件名指定不可・ユーザー設定からのみ）
  - カメラ機種: カメラ（機種名を保存）/カメラ詳細（機種名＋撮影設定を保存）/カメラなし（保存しない）
  - 位置情報（**メール投稿のみ**）: 都道府県/市町村（EXIFのGPSから逆ジオコーディングして保存）
- **デフォルト**: 未指定はユーザーのWeb初期設定（`defaultPosition`/`defaultVisibility`/`defaultCameraOption` 等）→ 無ければハードコード（優先順位: 件名 > ユーザー設定 > フォールバック）。
- **撮影情報**: サーバー側でEXIF解析。`cameraOption` は `none`/`show`/`detail` の3値（後方互換で `show` を中間に据える）。
  - `show`: カメラのメーカー名・機種名のみ保存。
  - `detail`: 上記に加え、F値・シャッター速度・ISO感度・焦点距離(+35mm換算)・レンズ名・露出補正・フラッシュを `exif_details`（JSON）に保存。撮影日時・撮影方向は取得しない。整形は [src/lib/exif/details.ts](../src/lib/exif/details.ts)。
  - 撮影場所は件名コマンド指定時のみ保存（GPS座標自体は保存しない）。

## Bot投稿機能（メンション投稿）
Mastodon上でBotにメンションして画像生成・投稿する機能。

### 仕組み
- **Botアカウント**: `@pic@handon.club`（環境変数で設定可能）。
- **フロー**: ①画像付きメンション受信 → ②通知取得（主: Streaming API WebSocket `src/lib/mention/streamer.ts`／フォールバック: 定期ジョブによる since_id ポーリング `fetcher.ts`・`ingest.ts` で取りこぼし補完）→ ③パース `parser.ts` → ④画像処理・投稿 `processor.ts` → ⑤元投稿削除しユーザーアカウントで再投稿 → ⑥DB保存（source: "mention"）。

### コマンド形式
`@pic [オプション] テキスト`（`[...]` 内にスペース区切り）
- オプション値はメール投稿と同じ（位置/色/サイズ/フォント/アレンジ）。公開範囲 public/unlisted（未指定はユーザー設定）。
- 特殊: `debug`（開始・完了をBotがリプライ通知）/ `keep`（元投稿を削除せず保持）。
- 例: `@pic [上 赤 大] こんにちは` / `@pic [下 ネオン debug] テスト` / `@pic [keep unlisted] 元投稿を残す`

### 制約・出力
- 画像1枚のみ（動画・GIF不可）・テキスト1〜140文字・ユーザーは事前ログイン必須・リトライ最大2回（失敗時Botがリプライ通知）。
- 生成・保存形式は連携インスタンスによらず常に AVIF。**Mastodon へ送るときだけ**投稿直前に JPEG へ変換する（web投稿・メール投稿・再投稿と共通。[出力形式](#出力形式)参照）。
- 環境変数: `MASTODON_BOT_INSTANCE_URL` / `MASTODON_BOT_INSTANCE_DOMAIN` / `MASTODON_BOT_ACCESS_TOKEN` / `MASTODON_BOT_ACCT`。

## メンションのALT引き継ぎ
Bot投稿は元投稿の添付メディアの `description` をそのまま引き継ぐ（[processor.ts](../src/lib/mention/processor.ts)）。**メール投稿は非対応**。
