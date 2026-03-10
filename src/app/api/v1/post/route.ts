/**
 * 画像をR2に保存してFediverseに投稿するAPI
 * POST /api/v1/post
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { getCurrentUserWithValidation } from "@/lib/auth/session";
import { decryptToken } from "@/lib/auth/tokens";
import { uploadImage, generateStorageKey, getExtensionFromMimeType } from "@/lib/storage/r2";
import { postToMastodon, postToMisskey } from "@/lib/fediverse/post";
import prisma from "@/lib/db";
import {
  Position,
  FontFamily,
  Color,
  Size,
  OutputFormat,
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
    const mimeType = formData.get("mimeType") as string | null;

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

    // 画像メタデータを取得
    const metadata = await sharp(imageBuffer).metadata();

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
        source: "web",
        isPublic: true,
      },
    });

    // 画像の詳細ページURL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const imagePageUrl = `${appUrl}/${user.username}/status/${imageId}`;

    // アクセストークンを復号化
    const accessToken = decryptToken(user.accessToken);

    // Fediverseに投稿
    let postResult;
    if (user.instance.type === "mastodon") {
      postResult = await postToMastodon(
        user.instance.domain,
        accessToken,
        imageBuffer,
        mimeType,
        filename,
        text,
        imagePageUrl
      );
    } else if (user.instance.type === "misskey") {
      postResult = await postToMisskey(
        user.instance.domain,
        accessToken,
        imageBuffer,
        mimeType,
        filename,
        text,
        imagePageUrl
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
