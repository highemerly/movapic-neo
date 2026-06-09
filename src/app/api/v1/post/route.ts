/**
 * 画像をR2に保存してFediverseに投稿するAPI
 * POST /api/v1/post
 */

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getCurrentUserWithValidation } from "@/lib/auth/session";
import { decryptToken } from "@/lib/auth/tokens";
import { reverseGeocode } from "@/lib/geocode/gsi";
import { publishImage, PublishVisibility } from "@/lib/publish/publishImage";
import {
  Position,
  FontFamily,
  Color,
  Size,
  OutputFormat,
  Arrangement,
  MAX_FILE_SIZE,
} from "@/types";

/**
 * sharp で検出した画像メタデータから、R2 に保存して良い Content-Type を返す。
 * /api/v1/generate の出力（JPEG / AVIF）のみ許可。
 * sharp 0.30+ は AVIF を format='heif', compression='av1' として返す（libheif 経由）。
 */
function detectSafeMimeType(metadata: sharp.Metadata): string | undefined {
  if (metadata.format === "jpeg") return "image/jpeg";
  if (metadata.format === "avif") return "image/avif";
  if (metadata.format === "heif" && metadata.compression === "av1") {
    return "image/avif";
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const user = await getCurrentUserWithValidation();
    if (!user) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      );
    }

    const formData = await request.formData();

    // パラメータの取得
    const imageBlob = formData.get("image") as Blob | null;
    const text = formData.get("text") as string | null;
    const position = formData.get("position") as Position | null;
    const font = formData.get("font") as FontFamily | null;
    const color = formData.get("color") as Color | null;
    const size = formData.get("size") as Size | null;
    const output = formData.get("output") as OutputFormat | null;
    const arrangement = (formData.get("arrangement") as Arrangement | null) || "none";
    const visibility = formData.get("visibility") as string | null;

    // EXIFメタデータ（クライアントが元画像から抽出したものを受け取る）
    // カメラ機種と撮影場所は独立。各オプションごとに保存対象を決める。
    // - cameraOption:   "none" | "show"
    // - locationOption: "none" | "pref" | "city"
    // 注: 撮影日時はプライバシー保護のため現在は取得しない（DBカラム capturedAt は将来用に保持）
    const cameraOption = (formData.get("cameraOption") as string | null) ?? "none";
    const locationOption = (formData.get("locationOption") as string | null) ?? "none";

    let cameraMake: string | null = null;
    let cameraModel: string | null = null;
    const capturedAt: Date | null = null;
    if (cameraOption === "show") {
      cameraMake = (formData.get("cameraMake") as string | null)?.slice(0, 100) || null;
      cameraModel = (formData.get("cameraModel") as string | null)?.slice(0, 100) || null;
    }

    // バリデーション
    if (!imageBlob || !text || !position || !font || !color || !size || !output) {
      return NextResponse.json(
        { error: "必須パラメータが不足しています" },
        { status: 400 }
      );
    }

    // ファイルサイズ上限
    if (imageBlob.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `ファイルサイズが${MAX_FILE_SIZE / 1024 / 1024}MBを超えています` },
        { status: 400 }
      );
    }

    // 画像バッファを取得
    const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

    // sharp で実フォーマットを検出（クライアント送信の mimeType は信任しない）
    // R2 が任意の Content-Type で任意コンテンツを配信することを防ぐため、
    // /api/v1/generate の出力形式 (JPEG/AVIF) のみ許可する。
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(imageBuffer).metadata();
    } catch {
      return NextResponse.json(
        { error: "画像の解析に失敗しました" },
        { status: 400 }
      );
    }
    const mimeType = detectSafeMimeType(metadata);
    if (!mimeType) {
      return NextResponse.json(
        { error: "サポートされていない画像形式です" },
        { status: 400 }
      );
    }

    // 位置情報: locationOption が pref / city の時だけサーバー側で再ジオコーディングして
    // 保存（権威データをサーバー側で確定するため、クライアントからの prefecture/city 文字列は
    // そのまま保存せず GPS座標から逆引きする）。
    let locationPrefecture: string | null = null;
    let locationCity: string | null = null;
    if (locationOption === "pref" || locationOption === "city") {
      const gpsLatRaw = formData.get("gpsLatitude") as string | null;
      const gpsLngRaw = formData.get("gpsLongitude") as string | null;
      if (gpsLatRaw != null && gpsLngRaw != null) {
        const lat = parseFloat(gpsLatRaw);
        const lng = parseFloat(gpsLngRaw);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const geo = await reverseGeocode(lat, lng);
          if (geo) {
            locationPrefecture = geo.prefecture;
            if (locationOption === "city") {
              locationCity = geo.city;
            }
          }
        }
      }
    }

    // 公開範囲を正規化（フォーム値は null や任意文字列になりうる）
    const publishVisibility: PublishVisibility =
      visibility === "local" ? "local" : visibility === "unlisted" ? "unlisted" : "public";

    // 保存→投稿（投稿失敗でも画像は残す＝web/email共通ポリシー）
    const result = await publishImage({
      buffer: imageBuffer,
      contentType: mimeType,
      user: {
        id: user.id,
        username: user.username,
        accessToken: decryptToken(user.accessToken),
        instance: { domain: user.instance.domain, type: user.instance.type },
      },
      text,
      options: { position, font, color, size, outputFormat: output, arrangement },
      source: "web",
      visibility: publishVisibility,
      persistOnPostFailure: true,
      dimensions: { width: metadata.width || 0, height: metadata.height || 0 },
      extras: { cameraMake, cameraModel, capturedAt, locationPrefecture, locationCity },
    });

    if (result.postError) {
      // 投稿に失敗した場合も画像は保存済み。エラーメッセージとともに imageId を返す。
      return NextResponse.json(
        {
          error: result.postError,
          imageId: result.imageId,
          imagePageUrl: result.imagePageUrl,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imageId: result.imageId,
      imagePageUrl: result.imagePageUrl,
      postUrl: result.postUrl,
    });
  } catch (error) {
    console.error("Post error:", error);
    return NextResponse.json(
      { error: "投稿に失敗しました" },
      { status: 500 }
    );
  }
}
