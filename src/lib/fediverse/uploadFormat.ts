/**
 * Fediverse へアップロードするときの画像形式を決める。
 *
 * SHAMEZO が保存・表示する画像は例外なく AVIF だが、Mastodon は AVIF を受け取れない
 * （4.7.2 で libvips の HEIF ローダーがブロックされ、アップロードが 500 になる。詳細は
 * AVIF_MAX_FILE_SIZE のコメント）。そこで「保存形式」と「連合へ送る形式」を分離し、
 * 投稿直前にここで送信形式だけを決める。
 *
 * sharp/skia に依存しない純粋ロジック＝worker-front / web から呼んで安全。
 * 実際の変換は compute（/api/internal/transcode）が行う。
 */

/** アップロードに使う形式。transcodeTo が非 null のときだけ変換が必要。 */
export interface UploadFormat {
  /** アップロード時に申告する Content-Type。 */
  contentType: string;
  /** アップロード時のファイル名（拡張子は contentType に合わせる）。 */
  filename: string;
  /** 変換先。null＝保存済みのバイト列をそのまま送れる。 */
  transcodeTo: "jpeg" | null;
}

/** 拡張子を差し替える。拡張子が無いファイル名にはそのまま付ける。 */
function replaceExtension(filename: string, extension: string): string {
  const dot = filename.lastIndexOf(".");
  // ディレクトリ区切り以降にドットが無ければ「拡張子なし」扱い（例 "image"）。
  if (dot <= 0 || dot < filename.lastIndexOf("/")) {
    return `${filename}.${extension}`;
  }
  return `${filename.slice(0, dot)}.${extension}`;
}

/**
 * 保存済み画像の形式と投稿先から、アップロード形式を決める。
 *
 * Mastodon かつ AVIF のときだけ JPEG へ変換する。それ以外（Misskey／変換前の
 * 旧 JPEG 投稿の再投稿）は保存物をそのまま送る。
 */
export function resolveUploadFormat(params: {
  instanceType: string;
  contentType: string;
  filename: string;
}): UploadFormat {
  const { instanceType, contentType, filename } = params;

  if (instanceType === "mastodon" && contentType === "image/avif") {
    return {
      contentType: "image/jpeg",
      filename: replaceExtension(filename, "jpg"),
      transcodeTo: "jpeg",
    };
  }

  return { contentType, filename, transcodeTo: null };
}
