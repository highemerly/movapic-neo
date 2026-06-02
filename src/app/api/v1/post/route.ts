/**
 * 画像をR2に保存してFediverseに投稿するAPI
 * POST /api/v1/post
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { getCurrentUserWithValidation } from "@/lib/auth/session";
import { decryptToken } from "@/lib/auth/tokens";
import { uploadImage, generateStorageKey, getExtensionFromMimeType } from "@/lib/storage/storage";
import { postToMastodon, postToMisskey, MastodonVisibility, MisskeyVisibility } from "@/lib/fediverse/post";
import { generateThumbnail, generateThumbnailKey } from "@/lib/thumbnail";
import { reverseGeocode } from "@/lib/geocode/gsi";
import prisma from "@/lib/db";
import {
  Position,
  FontFamily,
  Color,
  Size,
  OutputFormat,
  Arrangement,
} from "@/types";

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
    const mimeType = formData.get("mimeType") as string | null;
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
    if (!imageBlob || !text || !position || !font || !color || !size || !output || !mimeType) {
      return NextResponse.json(
        { error: "必須パラメータが不足しています" },
        { status: 400 }
      );
    }

    // 画像バッファを取得
    const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

    // 画像IDを生成
    const imageId = randomUUID();
    const extension = getExtensionFromMimeType(mimeType);
    const storageKey = generateStorageKey(imageId, extension);
    const filename = `movapic-${imageId}.${extension}`;

    // R2にアップロード
    await uploadImage(imageBuffer, storageKey, mimeType);

    // サムネイルを生成してR2にアップロード
    const thumbnailKey = generateThumbnailKey(storageKey);
    const thumbnailBuffer = await generateThumbnail(imageBuffer, position);
    await uploadImage(thumbnailBuffer, thumbnailKey, "image/webp");

    // 画像メタデータを取得
    const metadata = await sharp(imageBuffer).metadata();

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

    // DBに保存
    const image = await prisma.image.create({
      data: {
        id: imageId,
        userId: user.id,
        storageKey,
        filename,
        mimeType,
        fileSize: imageBuffer.length,
        width: metadata.width || 0,
        height: metadata.height || 0,
        overlayText: text,
        position,
        font,
        color,
        size,
        outputFormat: output,
        arrangement,
        thumbnailKey,
        source: "web",
        isPublic: true,
        cameraMake,
        cameraModel,
        capturedAt,
        locationPrefecture,
        locationCity,
      },
    });

    // 画像の詳細ページURL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const imagePageUrl = `${appUrl}/u/${user.username}/status/${imageId}`;

    // localの場合はFediverseに投稿しない（サービス内保存のみ）
    if (visibility === "local") {
      return NextResponse.json({
        success: true,
        imageId: image.id,
        imagePageUrl,
      });
    }

    // アクセストークンを復号化
    const accessToken = decryptToken(user.accessToken);

    // Fediverseに投稿
    let postResult;
    if (user.instance.type === "mastodon") {
      // MastodonのvisibilityはUIと同じ（public, unlisted）
      const mastodonVisibility: MastodonVisibility = visibility === "unlisted" ? "unlisted" : "public";
      postResult = await postToMastodon(
        user.instance.domain,
        accessToken,
        imageBuffer,
        mimeType,
        filename,
        text,
        imagePageUrl,
        mastodonVisibility
      );
    } else if (user.instance.type === "misskey") {
      // Misskeyではunlistedがhomeに相当
      const misskeyVisibility: MisskeyVisibility = visibility === "unlisted" ? "home" : "public";
      postResult = await postToMisskey(
        user.instance.domain,
        accessToken,
        imageBuffer,
        mimeType,
        filename,
        text,
        imagePageUrl,
        misskeyVisibility
      );
    } else {
      return NextResponse.json(
        { error: "サポートされていないプラットフォームです" },
        { status: 400 }
      );
    }

    if (!postResult.success) {
      // 投稿に失敗した場合、保存した画像を削除（オプション）
      // ここでは保存は維持して、エラーメッセージを返す
      return NextResponse.json(
        {
          error: postResult.error || "投稿に失敗しました",
          imageId: image.id,
          imagePageUrl,
        },
        { status: 500 }
      );
    }

    // postUrl/postIdをDBに保存（postIdはMastodonお気に入り連携で使用）
    if (postResult.postUrl) {
      await prisma.image.update({
        where: { id: image.id },
        data: { postUrl: postResult.postUrl, postId: postResult.postId },
      });
    }

    return NextResponse.json({
      success: true,
      imageId: image.id,
      imagePageUrl,
      postUrl: postResult.postUrl,
    });
  } catch (error) {
    console.error("Post error:", error);
    return NextResponse.json(
      { error: "投稿に失敗しました" },
      { status: 500 }
    );
  }
}
