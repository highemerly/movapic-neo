/**
 * Blurプレースホルダ用 LQIP 生成（サーバー専用・compute で実行）。
 *
 * 一覧（公開TL / お気に入り / ユーザーページ）で原本AVIFを読み込む間、
 * 原本を極小WebPに縮小した data URI から「元写真が分かる低解像度プレビュー」を
 * 即描画するための文字列を作る。追加の画像リクエストは発生しない
 * （data URI をAPIのJSONに相乗りさせ、クライアントは背景画像にそのまま使う）。
 *
 * sharp は呼び出し側（finalize route）が動的 import 済みのインスタンスを渡す
 * （このモジュール評価時に native を引かないため top-level import しない）。
 */

// LQIP パラメータ。長辺32px・WebP q60 で 1画像あたり data URI ~1KB 以内に収める。
// 表示側で拡大＋CSSぼかしをかけるため、この解像度で十分「元写真が分かる」プレビューになる。
const MAX_DIM = 32;
const WEBP_QUALITY = 60;

// sharp の最小限の型（sharp 型を import せず native を引かないため）。
type SharpFactory = (input: Buffer) => {
  resize: (
    w: number,
    h: number,
    opts: { fit: "inside" }
  ) => {
    webp: (opts: { quality: number }) => {
      toBuffer: () => Promise<Buffer>;
    };
  };
};

/**
 * 画像バッファから LQIP の data URI（data:image/webp;base64,...）を生成して返す。
 * 失敗時は null（呼び出し側で placeholder 無しにフォールバック）。
 */
export async function computeBlurDataUrl(
  sharp: SharpFactory,
  imageBuffer: Buffer
): Promise<string | null> {
  try {
    const webp = await sharp(imageBuffer)
      .resize(MAX_DIM, MAX_DIM, { fit: "inside" })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    return `data:image/webp;base64,${webp.toString("base64")}`;
  } catch (error) {
    console.error("[blurData] failed:", error);
    return null;
  }
}
