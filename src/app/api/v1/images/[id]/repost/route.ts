/**
 * 既存画像を改めて Fediverse へ投稿するエンドポイント
 * POST /api/v1/images/:id/repost
 *
 * 対象は「まだ Fediverse 未投稿（postId=null）の自分の画像」で、SHAMEZO 保存から
 * 一定期間内（repostImage の REPOST_MAX_AGE_MS）のもの。visibility は保存されていないため
 * リクエストで受け取る（UI は public/unlisted のみ提示。既定はユーザーの defaultVisibility）。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithValidation } from "@/lib/auth/session";
import { checkPostRateLimit } from "@/lib/postRateLimit";
import { decryptToken } from "@/lib/auth/tokens";
import { normalizeVisibility } from "@/lib/visibility";
import { repostImage } from "@/lib/publish/repostImage";
import { ErrorCodes, errorResponse, handleUnknownError } from "@/lib/errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserWithValidation();
    if (!user) {
      return errorResponse(ErrorCodes.AUTH_REQUIRED, "認証が必要です", 401, {
        suggestion: "ログインしてください",
      });
    }

    // 通常投稿と同じ枠でレート制限（連打・乱用防止）。重い処理の前に弾く。
    const rate = await checkPostRateLimit(user.id);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "投稿が多すぎます。しばらく待ってから再度お試しください。" },
        {
          status: 429,
          headers: rate.retryAfter
            ? { "Retry-After": String(rate.retryAfter) }
            : undefined,
        }
      );
    }

    const { id: imageId } = await params;

    const body = await request.json().catch(() => ({}));
    const visibility = normalizeVisibility(body?.visibility);
    // local は「連合しない」なので再投稿の対象外。UI は出さないが直叩き対策で弾く。
    if (visibility === "local") {
      return errorResponse(
        ErrorCodes.VALIDATION_INVALID,
        "公開範囲が正しくありません",
        400
      );
    }

    const result = await repostImage({
      imageId,
      user: {
        id: user.id,
        username: user.username,
        accessToken: decryptToken(user.accessToken),
        instance: { domain: user.instance.domain, type: user.instance.type },
        autoMakeup: user.autoMakeup,
      },
      visibility,
    });

    if (!result.ok) {
      switch (result.failure) {
        case "not_found":
          return errorResponse(ErrorCodes.NOT_FOUND, "画像が見つかりません", 404);
        case "forbidden":
          return errorResponse(
            ErrorCodes.FORBIDDEN,
            "自分の画像のみ投稿できます",
            403
          );
        case "already_posted":
          return errorResponse(
            ErrorCodes.CONFLICT,
            "この画像は既に Fediverse に投稿されています",
            409
          );
        case "too_old":
          return errorResponse(
            ErrorCodes.CONFLICT,
            "投稿から時間が経ちすぎているため、Fediverse へは投稿できません",
            409
          );
        default:
          return errorResponse(
            ErrorCodes.INTERNAL_ERROR,
            "画像の取得に失敗しました",
            500
          );
      }
    }

    // Fediverse 投稿だけ失敗したケースは部分的成功。/api/v1/post と同様、200＋fediverseError。
    return NextResponse.json({
      success: true,
      postUrl: result.postUrl,
      fediverseError: result.postError,
      fediverseErrorStatus: result.postErrorStatus,
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}
