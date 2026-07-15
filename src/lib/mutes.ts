/**
 * ユーザーミュートの共通ロジック。
 *
 * ミュートは片方向・秘匿（相手に通知しない）。muter が mutedUser の投稿を
 * 公開タイムライン／同じサーバー／ランダムから隠す。お気に入りは対象外。
 *
 * 期限は expiresAt で表現し、null=無期。「有効な」ミュートは expiresAt が null
 * または未来のもの（過去のものは期限切れ＝無効）。期限切れ行の物理削除は
 * 定期ジョブ（30分毎メンテ）に委ね、参照側は常にこの有効判定でフィルタする。
 */

import prisma from "@/lib/db";

// 期間の定義（純粋ロジック）は muteDurations.ts に分離。API・テストの利便のため再エクスポートする。
export {
  MUTE_DURATIONS,
  MUTE_DURATION_LABELS,
  isMuteDuration,
  durationToExpiresAt,
  type MuteDuration,
} from "./muteDurations";

/** 有効ミュートだけを拾う where 断片（expiresAt が null または未来）。 */
function activeExpiryWhere(now: Date) {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

/**
 * muter が現在ミュートしているユーザーの id 一覧。
 * ランダム投稿のサーバー側除外（userId notIn）で使う。
 */
export async function getActiveMutedUserIds(
  muterId: string,
  now: Date = new Date()
): Promise<string[]> {
  const rows = await prisma.mute.findMany({
    where: { muterId, ...activeExpiryWhere(now) },
    select: { mutedUserId: true },
  });
  return rows.map((r) => r.mutedUserId);
}

/**
 * muter が現在ミュートしている投稿者のキー（`username@domain`）一覧。
 * タイムラインのクライアント側除外で、画像カードの投稿者と突き合わせる。
 * キー形式は TimelineCardImage の `${user.username}@${user.instance}` と一致させる。
 */
export async function getMutedAuthorKeys(
  muterId: string,
  now: Date = new Date()
): Promise<string[]> {
  const rows = await prisma.mute.findMany({
    where: { muterId, ...activeExpiryWhere(now) },
    select: {
      mutedUser: {
        select: { username: true, instance: { select: { domain: true } } },
      },
    },
  });
  return rows.map((r) => `${r.mutedUser.username}@${r.mutedUser.instance.domain}`);
}

export type ActiveMuteEntry = {
  id: string;
  expiresAt: Date | null;
  createdAt: Date;
  mutedUser: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    domain: string;
  };
};

/** 有効ミュートの件数（管理画面のページネーション用）。 */
export async function countActiveMutes(
  muterId: string,
  now: Date = new Date()
): Promise<number> {
  return prisma.mute.count({ where: { muterId, ...activeExpiryWhere(now) } });
}

/**
 * muter の有効ミュート一覧（管理画面用）。相手の表示情報を含める。
 * 期限切れは含めない（掃除前でも参照は無効扱い）。
 * skip/take でオフセットページングに対応する（管理画面は searchParams 駆動）。
 */
export async function getActiveMutes(
  muterId: string,
  { now = new Date(), skip, take }: { now?: Date; skip?: number; take?: number } = {}
): Promise<ActiveMuteEntry[]> {
  const rows = await prisma.mute.findMany({
    where: { muterId, ...activeExpiryWhere(now) },
    orderBy: { createdAt: "desc" },
    ...(skip !== undefined && { skip }),
    ...(take !== undefined && { take }),
    select: {
      id: true,
      expiresAt: true,
      createdAt: true,
      mutedUser: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          instance: { select: { domain: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    mutedUser: {
      id: r.mutedUser.id,
      username: r.mutedUser.username,
      displayName: r.mutedUser.displayName,
      avatarUrl: r.mutedUser.avatarUrl,
      domain: r.mutedUser.instance.domain,
    },
  }));
}

/**
 * muter が mutedUser を現在ミュートしているか（有効な期限のもの）を返す。
 * ユーザーページの「ミュート中」バッジと解除期限表示に使う。
 */
export async function getActiveMute(
  muterId: string,
  mutedUserId: string,
  now: Date = new Date()
): Promise<{ expiresAt: Date | null } | null> {
  const row = await prisma.mute.findFirst({
    where: { muterId, mutedUserId, ...activeExpiryWhere(now) },
    select: { expiresAt: true },
  });
  return row ?? null;
}

/**
 * 閲覧者が対象ユーザーをミュートしているか（バッジ表示用の真偽値）。
 * 未ログイン・自分自身のときは false。各ユーザーページから手軽に呼べるようにした薄いラッパー。
 */
export async function isMutedByViewer(
  viewerId: string | null | undefined,
  targetUserId: string,
  now: Date = new Date()
): Promise<boolean> {
  if (!viewerId || viewerId === targetUserId) return false;
  return (await getActiveMute(viewerId, targetUserId, now)) !== null;
}
