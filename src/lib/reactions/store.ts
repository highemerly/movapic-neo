/**
 * Reaction テーブル（SHAMEZO 上で押されたリアクション）の読み書き。
 *
 * 表示に使うときは必ず連合キャッシュとマージする（src/lib/reactions/merge.ts）。
 * sharp/skia には触れないため worker-front から呼んでも安全。
 */

import prisma from "@/lib/db";
import type { ReactionForReconcile } from "./reconcile";
import type { StoredReaction } from "./types";

const REACTION_INCLUDE = { user: { include: { instance: true } } } as const;

/** Mastodon/Misskey とも username@domain 規約。オーナー一覧の acct と突き合わせられる形 */
function reactionAcct(username: string, domain: string): string {
  return `${username}@${domain}`;
}

function toStoredReaction(row: {
  emoji: string;
  emojiImageUrl: string | null;
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    instance: { domain: string };
  };
}): StoredReaction {
  const domain = row.user.instance.domain;
  return {
    acct: reactionAcct(row.user.username, domain),
    displayName: row.user.displayName,
    avatarUrl: row.user.avatarUrl,
    // Mastodon/Misskey ともユーザーページは https://{domain}/@{username} で開ける
    profileUrl: `https://${domain}/@${row.user.username}`,
    emoji: row.emoji,
    emojiImageUrl: row.emojiImageUrl,
  };
}

/** 画像に付いた SHAMEZO 上のリアクションを、押された順に返す。 */
export async function loadStoredReactions(imageId: string): Promise<StoredReaction[]> {
  const rows = await prisma.reaction.findMany({
    where: { imageId },
    include: REACTION_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toStoredReaction);
}

/**
 * 複数画像ぶんをまとめて読む（一覧・カード表示用）。画像ごとに findMany を撃たないための版。
 * 返り値は imageId → リアクション（押された順）。
 */
export async function loadStoredReactionsByImage(
  imageIds: string[]
): Promise<Map<string, StoredReaction[]>> {
  const result = new Map<string, StoredReaction[]>();
  if (imageIds.length === 0) return result;

  const rows = await prisma.reaction.findMany({
    where: { imageId: { in: imageIds } },
    include: REACTION_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
  for (const row of rows) {
    const list = result.get(row.imageId);
    if (list) list.push(toStoredReaction(row));
    else result.set(row.imageId, [toStoredReaction(row)]);
  }
  return result;
}

/**
 * リアクションを設定する。1ユーザー1リアクションなので、別の絵文字なら付け替えになる。
 * federated: いま Fediverse へ送ったか（local 投稿は送り先が無いので false）。送った時刻を
 * federatedAt に残し、取り消し検知の対象と猶予の起点にする（付け替えも送り直すので毎回更新）。
 */
export async function setReaction(params: {
  imageId: string;
  userId: string;
  emoji: string;
  emojiImageUrl: string | null;
  federated: boolean;
}): Promise<void> {
  const { imageId, userId, emoji, emojiImageUrl, federated } = params;
  const federatedAt = federated ? new Date() : null;
  await prisma.reaction.upsert({
    where: { imageId_userId: { imageId, userId } },
    create: { imageId, userId, emoji, emojiImageUrl, federatedAt },
    update: { emoji, emojiImageUrl, federatedAt },
  });
}

/** リアクションを解除する。付いていなくても成功として扱う。 */
export async function clearReaction(imageId: string, userId: string): Promise<void> {
  await prisma.reaction.deleteMany({ where: { imageId, userId } });
}

/**
 * オーナー側の取り消し検知（reconcile）用に、Fediverse へ送った Reaction だけを userId・acct・送信時刻で読む。
 * 送っていない行（local 投稿の時代に付いたもの）はオーナー一覧に居ないのが正常なので読まない。
 * 表示は使わないので include は最小限。
 */
export async function loadReactionsForReconcile(
  imageId: string
): Promise<ReactionForReconcile[]> {
  const rows = await prisma.reaction.findMany({
    where: { imageId, federatedAt: { not: null } },
    include: REACTION_INCLUDE,
  });
  return rows.map((row) => ({
    userId: row.userId,
    acct: reactionAcct(row.user.username, row.user.instance.domain),
    federatedAt: row.federatedAt!,
  }));
}

/** 指定ユーザーのリアクションをまとめて削除する（オーナー側で取り消された分の反映）。 */
export async function deleteReactions(
  imageId: string,
  userIds: string[]
): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.reaction.deleteMany({
    where: { imageId, userId: { in: userIds } },
  });
}
