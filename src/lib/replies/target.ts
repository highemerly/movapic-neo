/**
 * リプライ（スレッド）先の画像を DB から引く。仕様の全体は docs/reply.md。
 *
 * sharp/skia 非依存（worker-front・web のどちらから呼んでも安全）。
 */

import prisma from "@/lib/db";

/** 公開面に出ている画像（管理者の取り下げ isDisabled を除く）。リプライ先として選べる範囲と同じ。 */
const VISIBLE_WHERE = { isPublic: true, isDisabled: false } as const;

/**
 * Web でリプライ先に指定された画像を検証して返す。見えない（存在しない・取り下げ済み）なら null。
 * ミュートは見ない: ミュートされた側の書き込みを拒否すると、ミュートされていることが本人に分かってしまうため
 * （ミュートは常に muter の視界側で読み取り時に落とす）。
 */
export async function findReplyableImage(imageId: string) {
  return prisma.image.findFirst({
    where: { id: imageId, ...VISIBLE_WHERE },
    select: {
      id: true,
      userId: true,
      overlayText: true,
      thumbnailKey: true,
      storageKey: true,
      user: { select: { username: true, instance: { select: { domain: true } } } },
    },
  });
}

/**
 * 「連」（Bot・メール）で繋ぐ先＝投稿者本人の直近の投稿の ID。投稿が無ければ null。
 * 必ず userId で絞る（他人の投稿に繋がる経路を作らない）。取り下げ済みは本人にも見えないので飛ばし、
 * 本人の認識上の「直前」＝見えている最新の投稿に繋ぐ。並びは一覧と同じく createdAt→id で同時刻を決着させる。
 */
export async function findLatestOwnImageId(userId: string): Promise<string | null> {
  const latest = await prisma.image.findFirst({
    where: { userId, ...VISIBLE_WHERE },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  return latest?.id ?? null;
}
