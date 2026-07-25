/**
 * リアクションエンドポイント
 * GET    /api/v1/images/:id/reactions - チップ・ユーザー一覧・自分の状態（誰でも可）
 * PUT    /api/v1/images/:id/reactions - リアクションを設定（別の絵文字なら付け替え）
 * DELETE /api/v1/images/:id/reactions - リアクションを解除
 *
 * リアクションの正データは2系統ある（オーナーインスタンスのキャッシュ＋Reactionテーブル）。
 * 詳細は src/lib/reactions/merge.ts を参照。「このサービスのみ」(local) 投稿は Fediverse 上に
 * 対応するノートが無いため、DBだけで完結する。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentUserWithValidation } from "@/lib/auth/session";
import prisma from "@/lib/db";
import { decryptToken } from "@/lib/auth/tokens";
import { getAvatarUrl, getEmojiImageUrl } from "@/lib/avatar";
import { ErrorCodes, errorResponse, handleUnknownError } from "@/lib/errors";
import {
  sendReaction,
  removeReaction,
  toFavoriteReason,
  classifyPostStatus,
  favoriteErrorMessage,
  FavoriteError,
  type FavoriteErrorReason,
} from "@/lib/fediverse/favorite";
import {
  syncFavoriteCache,
  readCache,
  readTotalsCache,
  type ImageForFavorite,
  type SyncResult,
} from "@/lib/fediverse/favoriteSync";
import { shouldSyncOnGet } from "@/lib/fediverse/favoritePolicy";
import { getInstanceEmojiCatalog } from "@/lib/fediverse/emojis";
import { enqueueFavoriteSync } from "@/lib/queue";
import { reconcileFavoriteNotificationSafely } from "@/lib/notifications/favoriteNotifications";
import { mergeReactions, toMergedFavoriters } from "@/lib/reactions/merge";
import { clearReaction, loadStoredReactions, setReaction } from "@/lib/reactions/store";
import {
  isSelectableUnicodeEmoji,
  normalizeReactionKey,
  parseCustomEmojiKey,
} from "@/lib/reactions/emojiKey";
import type { MergedReactions } from "@/lib/reactions/types";

type Viewer = NonNullable<Awaited<ReturnType<typeof getCurrentUserWithValidation>>>;

function viewerAcctOf(viewer: {
  username: string;
  instance: { domain: string };
}): string {
  return `${viewer.username}@${viewer.instance.domain}`;
}

/** この投稿を Fediverse へ送れるか（local投稿は送り先が無いのでDBだけで完結する） */
function isFediverseSendable(image: ImageForFavorite): boolean {
  const type = image.user.instance.type;
  return (type === "mastodon" || type === "misskey") && !!image.postId && !!image.postUrl;
}

/** クライアント表示用に整形（アバター・絵文字画像はプロキシ経由） */
function toClientPayload(merged: MergedReactions) {
  return {
    total: merged.total,
    chips: merged.chips.map((chip) => ({
      emoji: chip.emoji,
      imageUrl: getEmojiImageUrl(chip.imageUrl),
      count: chip.count,
      reactedByViewer: chip.reactedByViewer,
    })),
    usersByEmoji: Object.fromEntries(
      Object.entries(merged.usersByEmoji).map(([emoji, users]) => [
        emoji,
        users.map((user) => ({
          acct: user.acct,
          displayName: user.displayName,
          avatarUrl: getAvatarUrl(user.avatarUrl),
          profileUrl: user.profileUrl,
        })),
      ])
    ),
    viewerEmoji: merged.viewerEmoji,
  };
}

/**
 * 設定しようとしているリアクションを検証し、内部キーと表示用URLに解決する。
 * 任意の文字列を保存させないため、必ずここを通す。
 */
async function resolveRequestedEmoji(
  raw: unknown,
  viewer: Viewer
): Promise<{ emoji: string; emojiImageUrl: string | null } | { error: string }> {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { error: "リアクションを指定してください" };
  }
  const viewerDomain = viewer.instance.domain;
  const emoji = normalizeReactionKey(raw, viewerDomain);
  const custom = parseCustomEmojiKey(emoji);

  if (viewer.instance.type === "mastodon") {
    // Mastodonにはリアクションが無く favourite しか送れないため、選べるのは Unicode 絵文字のみ
    // （どれを選んでも Fediverse へは favourite・絵文字は SHAMEZO のDBにだけ残る）。
    if (custom || !isSelectableUnicodeEmoji(emoji)) {
      return { error: "リアクションには絵文字を指定してください" };
    }
    return { emoji, emojiImageUrl: null };
  }

  if (!custom) {
    if (!isSelectableUnicodeEmoji(emoji)) {
      return { error: "リアクションには絵文字を指定してください" };
    }
    return { emoji, emojiImageUrl: null };
  }

  // カスタム絵文字は自分のサーバーのものだけ（他サーバーの絵文字はMisskeyでも押せない）
  if (custom.host !== viewerDomain.toLowerCase()) {
    return { error: "自分のサーバーのカスタム絵文字のみ使用できます" };
  }
  const catalog = await getInstanceEmojiCatalog(viewerDomain);
  const found = catalog?.byName.get(custom.name);
  if (!found) {
    return { error: "その絵文字はサーバーに見つかりませんでした" };
  }
  return { emoji, emojiImageUrl: found.url };
}

async function findImage(imageId: string) {
  return prisma.image.findUnique({
    where: { id: imageId, isPublic: true, isDisabled: false },
    include: { user: { include: { instance: true } } },
  });
}

/** 現在のキャッシュ（同期済みならその結果）と Reaction テーブルから表示用の状態を組む */
async function buildMerged(
  image: ImageForFavorite,
  synced: SyncResult | null,
  viewerAcct: string | null
): Promise<MergedReactions> {
  return mergeReactions({
    fediverseCount: synced?.fediverseCount ?? image.fediverseCount,
    totalsCache: synced ? synced.totalsCache : readTotalsCache(image),
    cachedFavoriters: synced ? synced.favoriters : readCache(image),
    storedReactions: await loadStoredReactions(image.id),
    viewerAcct,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: imageId } = await params;
    const currentUser = await getCurrentUser();

    const image = await findImage(imageId);
    if (!image) {
      return errorResponse(ErrorCodes.NOT_FOUND, "画像が見つかりません", 404);
    }

    const sendable = isFediverseSendable(image);
    let lastSyncedAt = image.favoritesSyncedAt;
    // 既存のpostStatusから理由を復元（前回のsync結果を引き継ぐ）
    let errorReason: FavoriteErrorReason | null = sendable
      ? classifyPostStatus(image.postStatus)
      : null;

    let synced: SyncResult | null = null;
    if (
      sendable &&
      shouldSyncOnGet(image.createdAt, image.postStatus, image.favoritesSyncedAt)
    ) {
      synced = await syncFavoriteCache(image);
      errorReason = synced.errorReason;
      lastSyncedAt = new Date();
    }

    const merged = await buildMerged(
      image,
      synced,
      currentUser ? viewerAcctOf(currentUser) : null
    );

    return NextResponse.json(
      {
        success: true,
        // 公開画像ならlocal投稿でもリアクションできる（記録先がDBにあるため）
        reactable: true,
        fediverseSendable: sendable,
        ...toClientPayload(merged),
        lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
        syncError: favoriteErrorMessage(errorReason),
      },
      {
        // viewerEmoji 等が viewer 依存なので private（CDN が他ユーザーへ配らないように）
        headers: { "Cache-Control": "private, max-age=60" },
      }
    );
  } catch (error) {
    return handleUnknownError(error);
  }
}

function fediverseErrorResponse(reason: FavoriteErrorReason) {
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
    favoriteErrorMessage(reason) ?? "リアクションの送信に失敗しました",
    status,
    suggestion
  );
}

async function handleWrite(
  imageId: string,
  action: "set" | "clear",
  rawEmoji: unknown
) {
  const viewer = await getCurrentUserWithValidation();
  if (!viewer) {
    return errorResponse(ErrorCodes.AUTH_REQUIRED, "認証が必要です", 401, {
      suggestion: "ログインしてください",
    });
  }
  if (viewer.instance.type !== "mastodon" && viewer.instance.type !== "misskey") {
    return errorResponse(
      ErrorCodes.VALIDATION_INVALID,
      "リアクションはMastodon・Misskeyアカウントで利用できます",
      400
    );
  }

  const image = await findImage(imageId);
  if (!image) {
    return errorResponse(ErrorCodes.NOT_FOUND, "画像が見つかりません", 404);
  }

  const viewerAcct = viewerAcctOf(viewer);
  const previous = await prisma.reaction.findUnique({
    where: { imageId_userId: { imageId, userId: viewer.id } },
    select: { emoji: true },
  });

  let resolved: { emoji: string; emojiImageUrl: string | null } | null = null;
  if (action === "set") {
    const result = await resolveRequestedEmoji(rawEmoji, viewer);
    if ("error" in result) {
      return errorResponse(ErrorCodes.VALIDATION_INVALID, result.error, 400);
    }
    resolved = result;
  }

  // ── Fediverse へ反映（local投稿は送り先が無いので飛ばす）──
  const sendable = isFediverseSendable(image);
  if (sendable) {
    const actionParams = {
      viewerType: viewer.instance.type,
      viewerDomain: viewer.instance.domain,
      viewerToken: decryptToken(viewer.accessToken),
      ownerDomain: image.user.instance.domain,
      postId: image.postId!,
      postUrl: image.postUrl!,
    };
    // Mastodonのfavouriteは絵文字を持たないため、絵文字の変更だけなら送り直す必要がない
    const emojiChangeOnly =
      action === "set" && viewer.instance.type === "mastodon" && previous !== null;
    if (!emojiChangeOnly) {
      try {
        if (action === "set") await sendReaction(actionParams, resolved!.emoji);
        else await removeReaction(actionParams);
      } catch (error) {
        const reason = toFavoriteReason(error);
        if (error instanceof FavoriteError) {
          // 想定内の分類済みエラー（404/429/5xx 等）はスタックトレース不要。1行で残す
          console.error(
            `[reaction] ${action} failed (status=${error.httpStatus}, reason=${reason}): imageId=${imageId}`
          );
        } else {
          // 想定外（タイムアウト・復号/DB エラー等）はスタックトレース付きで調査可能にする
          console.error(`[reaction] ${action} failed (unexpected): imageId=${imageId}`, error);
        }
        return fediverseErrorResponse(reason);
      }
    }
  }

  // ── SHAMEZO 側に記録。Fediverse への送信が成功してからにする（送れていないのに
  //    押せたように見えるのを避ける）。
  if (action === "set") {
    await setReaction({
      imageId,
      userId: viewer.id,
      emoji: resolved!.emoji,
      emojiImageUrl: resolved!.emojiImageUrl,
    });
  } else {
    await clearReaction(imageId, viewer.id);
  }

  let synced: SyncResult | null = null;
  if (sendable) {
    // オーナー側キャッシュを即時同期する（syncFavoriteCache は throw しない契約なので、
    // ここで失敗しても「操作は成功したのに500 → 再操作で二重トグル」にはならない）。
    // favoriteCount のマージ再計算も sync 内で行われる。
    synced = await syncFavoriteCache(image);

    // 連合遅延で今回の同期にまだ載っていない場合だけ、反映確認つきの遅延sync（5s→30s）を積む
    const present = synced.favoriters.some((f) => f.acct === viewerAcct);
    const reflected = action === "set" ? present : !present;
    if (!reflected) {
      try {
        await enqueueFavoriteSync({
          imageId,
          viewerAcct,
          favourited: action === "set",
        });
      } catch (error) {
        console.error(`[reaction] sync ジョブの投入に失敗: imageId=${imageId}`, error);
      }
    }
  }

  const merged = await buildMerged(image, synced, viewerAcct);

  if (!sendable) {
    // local投稿は同期が走らないため、合計の保存と通知の差分更新をここで行う
    await prisma.image.update({
      where: { id: imageId },
      data: { favoriteCount: merged.total },
    });
    await reconcileFavoriteNotificationSafely({
      imageId,
      ownerUserId: image.userId,
      ownerAcct: `${image.user.username}@${image.user.instance.domain}`,
      wasFirstSync: false,
      previousFavoriters: readCache(image),
      currentFavoriters: toMergedFavoriters(merged),
      count: merged.total,
    });
  }

  return NextResponse.json({
    success: true,
    reactable: true,
    fediverseSendable: sendable,
    ...toClientPayload(merged),
    syncError: favoriteErrorMessage(synced?.errorReason ?? null),
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: imageId } = await params;
    const body = (await request.json().catch(() => null)) as { emoji?: unknown } | null;
    return await handleWrite(imageId, "set", body?.emoji);
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
    return await handleWrite(imageId, "clear", undefined);
  } catch (error) {
    return handleUnknownError(error);
  }
}
