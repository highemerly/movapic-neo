/**
 * お気に入りエンドポイント（Mastodon連携）
 * GET    /api/v1/images/:id/favorite - キャッシュ取得＋TTL切れ時にMastodonからSync（誰でも可）
 * POST   /api/v1/images/:id/favorite - viewerのトークンでMastodonにお気に入り登録
 * DELETE /api/v1/images/:id/favorite - viewerのトークンでMastodonのお気に入りを解除
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser, getCurrentUserWithValidation } from "@/lib/auth/session";
import prisma from "@/lib/db";
import { decryptToken } from "@/lib/auth/tokens";
import { getAvatarUrl } from "@/lib/avatar";
import { ErrorCodes, errorResponse, handleUnknownError } from "@/lib/errors";
import {
  fetchMastodonFavoriteData,
  favoriteMastodonStatus,
  unfavoriteMastodonStatus,
  toFavoriteReason,
  toFavoriteHttpStatus,
  classifyPostStatus,
  favoriteErrorMessage,
  type CachedFavoriter,
  type FavoriteErrorReason,
} from "@/lib/fediverse/favorite";
import { reconcileFavoriteNotificationSafely } from "@/lib/notifications/favoriteNotifications";

// 投稿経過時間ベースのTTL（fav数が動きやすい投稿直後ほど短く）
const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;

// 最後のsync結果（postStatus）と投稿経過時間からTTLを算出
// - 4xx: 1日（削除確定・権限不足など、頻繁に再試行する意味が薄い）
// - 5xx / 0(接続失敗): 1時間
// - 200 / null: 投稿経過時間ベース
function computeCacheTtl(postCreatedAt: Date, postStatus: number | null): number {
  if (postStatus !== null) {
    if (postStatus >= 400 && postStatus < 500) return DAY_MS;
    if (postStatus === 0 || (postStatus >= 500 && postStatus < 600)) return HOUR_MS;
  }
  const age = Date.now() - postCreatedAt.getTime();
  if (age <= 5 * MIN_MS) return 1 * MIN_MS;
  if (age <= 2 * HOUR_MS) return 5 * MIN_MS;
  if (age <= 1 * DAY_MS) return 30 * MIN_MS;
  if (age <= 5 * DAY_MS) return 1 * HOUR_MS;
  return 1 * DAY_MS;
}

type ImageForFavorite = Prisma.ImageGetPayload<{
  include: { user: { include: { instance: true } } };
}>;

// この投稿がお気に入り可能か（Mastodonのstatusが存在する投稿のみ）
function isFavoritable(image: ImageForFavorite): boolean {
  return image.user.instance.type === "mastodon" && !!image.postId;
}

function readCache(image: ImageForFavorite): CachedFavoriter[] {
  return (image.favoritersCache as unknown as CachedFavoriter[] | null) ?? [];
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

// viewer自身をCachedFavoriter形に変換（お気に入りはMastodon限定なので
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

interface SyncResult {
  count: number;
  favoriters: CachedFavoriter[];
  errorReason: FavoriteErrorReason | null;
}

// オーナーのトークンでMastodonからお気に入り情報を取得し、キャッシュを更新
// 成功/失敗いずれもpostStatusとfavoritesSyncedAtを記録する。次回のTTLはcomputeCacheTtlが
// postStatusに応じて延長する（4xx→1日、5xx/接続失敗→1時間）→ 結果的に連打を防げる
async function syncFavoriteCache(image: ImageForFavorite): Promise<SyncResult> {
  try {
    const ownerToken = decryptToken(image.user.accessToken);
    const data = await fetchMastodonFavoriteData(
      image.user.instance.domain,
      ownerToken,
      image.postId!
    );
    // 更新前の状態（差分の基準）を退避してから上書きする
    const previousFavoriters = readCache(image);
    const wasFirstSync = !image.favoritesSyncedAt;
    await prisma.image.update({
      where: { id: image.id },
      data: {
        favoriteCount: data.count,
        favoritersCache: data.favoriters as unknown as Prisma.InputJsonValue,
        favoritesSyncedAt: new Date(),
        postStatus: 200,
      },
    });
    // 「お気に入りされた」通知を差分更新（失敗してもsync本体は止めない）
    await reconcileFavoriteNotificationSafely({
      imageId: image.id,
      ownerUserId: image.userId,
      ownerAcct: `${image.user.username}@${image.user.instance.domain}`,
      wasFirstSync,
      previousFavoriters,
      currentFavoriters: data.favoriters,
      count: data.count,
    });
    return { count: data.count, favoriters: data.favoriters, errorReason: null };
  } catch (error) {
    const httpStatus = toFavoriteHttpStatus(error);
    console.error(
      `[favorite] sync失敗 (status=${httpStatus}): imageId=${image.id}`,
      error
    );
    await prisma.image.update({
      where: { id: image.id },
      data: { favoritesSyncedAt: new Date(), postStatus: httpStatus },
    });
    return {
      count: image.favoriteCount,
      favoriters: readCache(image),
      errorReason: toFavoriteReason(error),
    };
  }
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
    // 既存のpostStatusから理由を復元（前回のsync結果を引き継ぐ）
    let errorReason: FavoriteErrorReason | null = favoritable
      ? classifyPostStatus(image.postStatus)
      : null;

    // TTL切れ（または未取得）ならMastodonからSync
    if (favoritable) {
      const ttl = computeCacheTtl(image.createdAt, image.postStatus);
      const isStale =
        !image.favoritesSyncedAt ||
        Date.now() - image.favoritesSyncedAt.getTime() > ttl;
      if (isStale) {
        const result = await syncFavoriteCache(image);
        count = result.count;
        favoriters = result.favoriters;
        errorReason = result.errorReason;
      }
    }

    return NextResponse.json({
      success: true,
      favoritable,
      favoriteCount: count,
      isFavorited: isFavoritedByViewer(favoriters, currentUser),
      favoriters: toClientFavoriters(favoriters),
      syncError: favoriteErrorMessage(errorReason),
    });
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

  if (viewer.instance.type !== "mastodon") {
    return errorResponse(
      ErrorCodes.VALIDATION_INVALID,
      "お気に入りはMastodonアカウントでのみ利用できます",
      400
    );
  }

  // viewerのトークンでMastodonにお気に入り操作
  let result: { favourited: boolean; count: number };
  try {
    const viewerToken = decryptToken(viewer.accessToken);
    const actionParams = {
      viewerDomain: viewer.instance.domain,
      viewerToken,
      ownerDomain: image.user.instance.domain,
      postId: image.postId!,
      postUrl: image.postUrl!,
    };
    result =
      action === "favourite"
        ? await favoriteMastodonStatus(actionParams)
        : await unfavoriteMastodonStatus(actionParams);
  } catch (error) {
    const reason = toFavoriteReason(error);
    console.error(`[favorite] ${action}失敗 (reason=${reason}): imageId=${imageId}`, error);
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

  // オーナー側のキャッシュを更新（avatar一覧・count）。federation遅延があるため
  // 操作者への即時応答にはviewer側の結果を使う
  const synced = await syncFavoriteCache(image);

  // federation遅延でオーナー側のfavourited_byにviewerがまだ載らないため、
  // 「お気に入りした人」一覧にはviewer自身を仮追加して即時表示する（DBキャッシュ
  // には保存しない＝次回以降のオーナー側syncが本物の反映を持ってくるまでの暫定表示）。
  // 解除時は逆にviewerを一覧から取り除く。
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
