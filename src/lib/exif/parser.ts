/**
 * 画像からEXIFを抽出する（クライアント/サーバー共通）。
 *
 * 用途:
 * - クライアント: /create で画像選択時（File）にカメラ情報・GPSを取り出し /api/v1/post へ送る
 * - サーバー: メール投稿の worker で元画像（Buffer）から取り出し、ユーザー設定・件名コマンドに応じて保存
 * exifr.parse は File / Buffer / Uint8Array のいずれも受け取れる。
 * 出力画像のEXIFは既存どおりサーバー側で常に除去される。
 */

import exifr from "exifr";

export interface ExtractedExif {
  cameraMake: string | null;
  cameraModel: string | null;
  capturedAt: Date | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
}

const EMPTY: ExtractedExif = {
  cameraMake: null,
  cameraModel: null,
  capturedAt: null,
  gpsLatitude: null,
  gpsLongitude: null,
};

export async function extractExif(
  input: File | Buffer | Uint8Array
): Promise<ExtractedExif> {
  try {
    // 撮影日時はプライバシー保護のため抽出しない（DBカラムは将来用に保持）。
    // pickに latitude/longitude を入れてもexifrがGPS IFDを自動で有効化しない事例が
    // あるため、必要なIFDを明示的に有効化する。
    const parsed = await exifr.parse(input, {
      ifd0: { pick: ["Make", "Model"] },
      gps: true,
    });

    if (!parsed) return EMPTY;

    // Android Chrome では GPSLatitudeRef/GPSLongitudeRef が欠落するケースがあり、
    // exifr が NaN を返すことがある。typeof NaN === "number" のため typeof チェックでは
    // 弾けず、結果として /api/v1/geocode に lat=null（JSON.stringify(NaN)→null）が送られて
    // 400 になっていた。Number.isFinite で有限値のみ採用する。
    const lat = Number.isFinite(parsed.latitude) ? (parsed.latitude as number) : null;
    const lng = Number.isFinite(parsed.longitude) ? (parsed.longitude as number) : null;

    return {
      cameraMake: typeof parsed.Make === "string" ? parsed.Make.trim() || null : null,
      cameraModel: typeof parsed.Model === "string" ? parsed.Model.trim() || null : null,
      capturedAt: null,
      gpsLatitude: lat,
      gpsLongitude: lng,
    };
  } catch {
    return EMPTY;
  }
}

