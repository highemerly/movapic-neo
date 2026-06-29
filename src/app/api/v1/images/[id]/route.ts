/**
 * 画像削除エンドポイント
 * DELETE /api/v1/images/:id
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithValidation } from "@/lib/auth/session";
import { deleteImage } from "@/lib/storage/storage";
import { decryptToken } from "@/lib/auth/tokens";
import { fediverseStatusExists } from "@/lib/fediverse/delete";
import prisma from "@/lib/db";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserWithValidation();

    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { id } = await params;

    // 画像を取得して所有者確認
    const image = await prisma.image.findUnique({
      where: { id },
    });

    if (!image) {
      return NextResponse.json({ error: "画像が見つかりません" }, { status: 404 });
    }

    if (image.userId !== user.id) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    // R2から削除（元画像とサムネイル）
    try {
      await deleteImage(image.storageKey);
      if (image.thumbnailKey) {
        await deleteImage(image.thumbnailKey);
      }
    } catch (error) {
      console.error("Failed to delete from R2:", error);
      // R2削除に失敗してもDB削除は続行
    }

    // DBから削除
    await prisma.image.delete({
      where: { id },
    });

    // 連携先（Mastodon/Misskey）に投稿が残っている場合は、その情報をクライアントに返す。
    // クライアントは「連携先の投稿も削除しますか？」と尋ね、ユーザーが望めば
    // /api/v1/fediverse/delete-status で実際に削除する（ここでは削除しない）。
    let remoteStatus: {
      statusId: string;
      statusUrl: string | null;
      platform: "mastodon" | "misskey";
    } | null = null;
    const type = user.instance.type;
    if (image.postId && (type === "mastodon" || type === "misskey")) {
      try {
        const accessToken = decryptToken(user.accessToken);
        const exists = await fediverseStatusExists(
          type,
          user.instance.domain,
          accessToken,
          image.postId
        );
        if (exists) {
          remoteStatus = {
            statusId: image.postId,
            statusUrl: image.postUrl,
            platform: type,
          };
        }
      } catch (error) {
        // 確認に失敗しても画像削除自体は成功しているので、尋ねずに進める
        console.error("Failed to check remote status:", error);
      }
    }

    return NextResponse.json({ success: true, remoteStatus });
  } catch (error) {
    console.error("Failed to delete image:", error);
    return NextResponse.json(
      { error: "画像の削除に失敗しました" },
      { status: 500 }
    );
  }
}
