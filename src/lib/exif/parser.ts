/**
 * クライアント側でアップロード前の画像からEXIFを抽出する。
 *
 * 用途: /create で画像選択時にカメラ情報・撮影日時・GPSを取り出し、
 * 投稿時に /api/v1/post へ別フィールドで送る。出力画像のEXIFは
 * 既存どおりサーバー側で常に除去される。
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

export async function extractExif(file: File): Promise<ExtractedExif> {
  try {
    const parsed = await exifr.parse(file, {
      pick: ["Make", "Model", "DateTimeOriginal", "latitude", "longitude"],
      // exifrは latitude/longitude を10進数に変換した値として提供する
    });

    if (!parsed) return EMPTY;

    const lat = typeof parsed.latitude === "number" ? parsed.latitude : null;
    const lng = typeof parsed.longitude === "number" ? parsed.longitude : null;

    return {
      cameraMake: typeof parsed.Make === "string" ? parsed.Make.trim() || null : null,
      cameraModel: typeof parsed.Model === "string" ? parsed.Model.trim() || null : null,
      capturedAt: parsed.DateTimeOriginal instanceof Date ? parsed.DateTimeOriginal : null,
      gpsLatitude: lat,
      gpsLongitude: lng,
    };
  } catch {
    return EMPTY;
  }
}
