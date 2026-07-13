import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import {
  ANNOUNCEMENTS_TAG,
  type AnnouncementRecord,
  toAnnouncementRecord,
  isPublished,
  listForAnnouncementsPage,
  bannerAnnouncements,
} from "@/lib/announcements";

/**
 * お知らせの DB 取得・キャッシュ層（サーバー専用）。
 * ピュアロジックは @/lib/announcements を参照。
 */

/** 全件をDBから取得（キャッシュ非経由）。Admin/キャッシュ元の共通実装。 */
async function fetchAllAnnouncements(): Promise<AnnouncementRecord[]> {
  const rows = await prisma.announcement.findMany({
    orderBy: { publishAt: "desc" },
  });
  return rows.map(toAnnouncementRecord);
}

/**
 * 全件（予約分含む）をキャッシュ経由で返す。時刻フィルタは呼び出し側で行う。
 * ANNOUNCEMENTS_DISABLE_CACHE=1 のときは毎回DBを引く（検証用）。
 */
export const getAllAnnouncementsCached: () => Promise<AnnouncementRecord[]> =
  process.env.ANNOUNCEMENTS_DISABLE_CACHE
    ? fetchAllAnnouncements
    : unstable_cache(fetchAllAnnouncements, [ANNOUNCEMENTS_TAG], {
        revalidate: 3600,
        tags: [ANNOUNCEMENTS_TAG],
      });

/** 一覧ページ用（公開済みのみ・新しい順）。 */
export async function getListedAnnouncements(): Promise<AnnouncementRecord[]> {
  return listForAnnouncementsPage(await getAllAnnouncementsCached(), Date.now());
}

/** 上部バナー用（公開済み・banner対象・pin中）。 */
export async function getBannerAnnouncements(): Promise<AnnouncementRecord[]> {
  return bannerAnnouncements(await getAllAnnouncementsCached(), Date.now());
}

/** 詳細ページ用。未公開/不在/detail無しは null。 */
export async function getAnnouncementForDetail(
  id: number
): Promise<AnnouncementRecord | null> {
  if (!Number.isInteger(id)) return null;
  const all = await getAllAnnouncementsCached();
  const a = all.find((x) => x.id === id);
  if (!a || !a.detail || !isPublished(a, Date.now())) return null;
  return a;
}

/** Admin 用: 予約・非掲載も含む全件（キャッシュ非経由で常に最新）。 */
export async function getAllAnnouncementsForAdmin(): Promise<
  AnnouncementRecord[]
> {
  return fetchAllAnnouncements();
}
