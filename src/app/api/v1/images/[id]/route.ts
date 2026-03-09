/**
 * 画像削除エンドポイント
 * DELETE /api/v1/images/:id
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { deleteImage } from "@/lib/storage/r2";
import prisma from "@/lib/db";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();

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

    // R2から削除
    try {
      await deleteImage(image.storageKey);
    } catch (error) {
      console.error("Failed to delete from R2:", error);
      // R2削除に失敗してもDB削除は続行
    }

    // DBから削除
    await prisma.image.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete image:", error);
    return NextResponse.json(
      { error: "画像の削除に失敗しました" },
      { status: 500 }
    );
  }
}
