/**
 * お気に入りエンドポイント（Fediverse連携：Mastodon=favourite / Misskey=リアクション）
 * GET    /api/v1/images/:id/favorite - キャッシュ取得＋TTL切れ時にオーナーからSync（誰でも可）
 * POST   /api/v1/images/:id/favorite - viewerのトークンでお気に入り登録
 * DELETE /api/v1/images/:id/favorite - viewerのトークンでお気に入りを解除
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentUserWithValidation } from "@/lib/auth/session";
import prisma from "@/lib/db";
import { decryptToken } from "@/lib/auth/tokens";
import { getAvatarUrl } from "@/lib/avatar";
import { ErrorCodes, errorResponse, handleUnknownError } from "@/lib/errors";
import {
  favoriteStatus,
  unfavoriteStatus,
  toFavoriteReason,
  classifyPostStatus,
  favoriteErrorMessage,
  FavoriteError,
  type CachedFavoriter,
  type FavoriteErrorReason,
} from "@/lib/fediverse/favorite";
import {
  syncFavoriteCache,
  readCache,
  type ImageForFavorite,
} from "@/lib/fediverse/favoriteSync";
import { shouldSyncOnGet } from "@/lib/fediverse/favoritePolicy";
import { enqueueFavoriteSync } from "@/lib/queue";

// この投稿がお気に入り可能か（Fediverseに投稿済み＝postIdがある投稿のみ。local投稿は対象外）
function isFavoritable(image: ImageForFavorite): boolean {
  const t = image.user.instance.type;
  return (t === "mastodon" || t === "misskey") && !!image.postId;
}

// viewerのacctがキャッシュに含まれるか
function isFavoritedByViewer(
  favoriters: CachedFavoriter[],
  viewer: { username: string; instance: { domain: string } } | null
): boolean {
  if (!viewer) return false;
  const viewerAcct = `${viewer.username}@${viewer.instance.domain}`;
  return favoriters.some((f) => f.acct === viewerAcct);
}

// viewer自身をCachedFavoriter形に変換（Mastodon/Misskeyとも
// プロフィールURLは `https://{domain}/@{username}` で組み立てられる）
function viewerToFavoriter(viewer: {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  instance: { domain: string };
}): CachedFavoriter {
  return {
    acct: `${viewer.username}@${viewer.instance.domain}`,
    displayName: viewer.displayName,
    avatarUrl: viewer.avatarUrl,
    profileUrl: `https://${viewer.instance.domain}/@${viewer.username}`,
  };
}

// オーナー側のfavoriters一覧にviewer自身を仮反映する。DBキャッシュには保存せず、
// レスポンス用の一覧だけを補正する（federation遅延の暫定表示）。
// - お気に入り時: 未掲載なら先頭に追加
// - 解除時: 一覧から取り除く
function mergeViewerFavoriter(
  favoriters: CachedFavoriter[],
  viewer: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    instance: { domain: string };
  },
  favourited: boolean
): CachedFavoriter[] {
  const viewerAcct = `${viewer.username}@${viewer.instance.domain}`;
  const withoutViewer = favoriters.filter((f) => f.acct !== viewerAcct);
  return favourited
    ? [viewerToFavoriter(viewer), ...withoutViewer]
    : withoutViewer;
}

// クライアント表示用にfavoritersを整形（avatarはプロキシ経由）
function toClientFavoriters(favoriters: CachedFavoriter[]) {
  return favoriters.map((f) => ({
    acct: f.acct,
    displayName: f.displayName,
    avatarUrl: getAvatarUrl(f.avatarUrl),
    profileUrl: f.profileUrl,
  }));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: imageId } = await params;
    const currentUser = await getCurrentUser();

    const image = await prisma.image.findUnique({
      where: { id: imageId, isPublic: true, isDisabled: false },
      include: { user: { include: { instance: true } } },
    });

    if (!image) {
      return errorResponse(ErrorCodes.NOT_FOUND, "画像が見つかりません", 404);
    }

    const favoritable = isFavoritable(image);

    let count = image.favoriteCount;
    let favoriters = readCache(image);
    // 最後に同期を試みた時刻（成功・失敗いずれも更新される）。未同期は null
    let lastSyncedAt = image.favoritesSyncedAt;
    // 既存のpostStatusから理由を復元（前回のsync結果を引き継ぐ）
    let errorReason: FavoriteErrorReason | null = favoritable
      ? classifyPostStatus(image.postStatus)
      : null;

    // TTL切れ（または未取得）ならMastodonからSync
    if (
      favoritable &&
      shouldSyncOnGet(image.createdAt, image.postStatus, image.favoritesSyncedAt)
    ) {
      const result = await syncFavoriteCache(image);
      count = result.count;
      favoriters = result.favoriters;
      errorReason = result.errorReason;
      lastSyncedAt = new Date(); // この同期で更新された
    }

    return NextResponse.json(
      {
        success: true,
        favoritable,
        favoriteCount: count,
        isFavorited: isFavoritedByViewer(favoriters, currentUser),
        favoriters: toClientFavoriters(favoriters),
        lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
        syncError: favoriteErrorMessage(errorReason),
      },
      {
        // ブラウザで60秒キャッシュ。isFavorited 等は viewer 依存なので private
        // （CDN/共有プロキシが他ユーザーへ配らないように）
        headers: { "Cache-Control": "private, max-age=60" },
      }
    );
  } catch (error) {
    return handleUnknownError(error);
  }
}

async function handleToggle(
  imageId: string,
  action: "favourite" | "unfavourite"
) {
  const viewer = await getCurrentUserWithValidation();
  if (!viewer) {
    return errorResponse(ErrorCodes.AUTH_REQUIRED, "認証が必要です", 401, {
      suggestion: "ログインしてください",
    });
  }

  const image = await prisma.image.findUnique({
    where: { id: imageId, isPublic: true, isDisabled: false },
    include: { user: { include: { instance: true } } },
  });

  if (!image) {
    return errorResponse(ErrorCodes.NOT_FOUND, "画像が見つかりません", 404);
  }

  if (!isFavoritable(image)) {
    return errorResponse(
      ErrorCodes.VALIDATION_INVALID,
      "この投稿はお気に入りできません",
      400
    );
  }

  if (viewer.instance.type !== "mastodon" && viewer.instance.type !== "misskey") {
    return errorResponse(
      ErrorCodes.VALIDATION_INVALID,
      "お気に入りはMastodon・Misskeyアカウントで利用できます",
      400
    );
  }

  // viewerのトークンでFediverse（Mastodon=favourite / Misskey=リアクション）にお気に入り操作
  let result: { favourited: boolean; count: number };
  try {
    const viewerToken = decryptToken(viewer.accessToken);
    const actionParams = {
      viewerType: viewer.instance.type,
      viewerDomain: viewer.instance.domain,
      viewerToken,
      ownerDomain: image.user.instance.domain,
      postId: image.postId!,
      postUrl: image.postUrl!,
    };
    result =
      action === "favourite"
        ? await favoriteStatus(actionParams)
        : await unfavoriteStatus(actionParams);
  } catch (error) {
    const reason = toFavoriteReason(error);
    if (error instanceof FavoriteError) {
      // 想定内の分類済みエラー（404/429/5xx 等）はスタックトレース不要。1行で残す
      console.error(
        `[favorite] ${action} failed (status=${error.httpStatus}, reason=${reason}): imageId=${imageId}`
      );
    } else {
      // 想定外（タイムアウト・復号/DB エラー等）はスタックトレース付きで調査可能にする
      console.error(`[favorite] ${action} failed (unexpected): imageId=${imageId}`, error);
    }
    const status =
      reason === "deleted" || reason === "unresolved"
        ? 404
        : reason === "forbidden"
          ? 403
          : 502;
    const code =
      reason === "deleted" || reason === "unresolved"
        ? ErrorCodes.NOT_FOUND
        : reason === "forbidden"
          ? ErrorCodes.AUTH_REQUIRED
          : ErrorCodes.INTERNAL_ERROR;
    const suggestion =
      reason === "forbidden"
        ? { suggestion: "再ログインしてください" }
        : reason === "unresolved"
          ? { suggestion: "少し時間をおいて再度お試しください" }
          : undefined;
    return errorResponse(
      code,
      favoriteErrorMessage(reason) ?? "Mastodonでのお気に入り操作に失敗しました",
      status,
      suggestion
    );
  }

  // オーナー側キャッシュを即時同期する。同一インスタンスや連合が速いケースはこれで即座に反映され、
  // 操作直後のリロード（SSR は DB キャッシュを読む）でも正しく見える。
  // syncFavoriteCache は throw しない契約（取得失敗も DB 障害も errorReason で返す）。これにより
  // 「Fediverse 操作は成功したのに sync 失敗で 500 → 再操作で二重トグル」を防ぐ。
  const synced = await syncFavoriteCache(image);

  // 連合遅延で「今の同期」に viewer の操作（fav=出現／unfav=消滅）がまだ載っていない場合だけ、
  // 反映確認つきの遅延 sync（5s→30s・早期終了）を開始して数十秒以内に追従させる。
  // 既に載っていれば不要（オーナー鯖へ余計な再取得をしない）。enqueue 失敗は操作を失敗させない。
  const viewerAcct = `${viewer.username}@${viewer.instance.domain}`;
  const present = synced.favoriters.some((f) => f.acct === viewerAcct);
  const reflected = action === "favourite" ? present : !present;
  if (!reflected) {
    try {
      await enqueueFavoriteSync({
        imageId,
        viewerAcct,
        favourited: action === "favourite",
      });
    } catch (error) {
      console.error(`[favorite] sync ジョブの投入に失敗: imageId=${imageId}`, error);
    }
  }

  // 連合遅延でオーナー側 favourited_by に viewer がまだ載らない/消えない過渡は、応答一覧に
  // viewer 自身を仮反映して即時表示する（DB には保存しない＝暫定表示）。解除時は取り除く。
  const responseFavoriters = mergeViewerFavoriter(
    synced.favoriters,
    viewer,
    action === "favourite"
  );

  return NextResponse.json({
    success: true,
    favoriteCount: result.count,
    isFavorited: result.favourited,
    favoriters: toClientFavoriters(responseFavoriters),
    syncError: favoriteErrorMessage(synced.errorReason),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: imageId } = await params;
    return await handleToggle(imageId, "favourite");
  } catch (error) {
    return handleUnknownError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: imageId } = await params;
    return await handleToggle(imageId, "unfavourite");
  } catch (error) {
    return handleUnknownError(error);
  }
}
