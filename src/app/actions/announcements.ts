"use server";

import { cookies } from "next/headers";
import { serializeAnnouncementReadIds } from "@/lib/announcements";

const COOKIE_NAME = "ann";
const COOKIE_MAX_AGE = 180 * 24 * 60 * 60; // 180日

/**
 * お知らせの既読管理（× で「すべて既読」にする）。
 *
 * 予約公開（publishAt）により「id順 ≠ 公開順」になりうるため、単一の最大id
 * （ハイウォーターマーク）だと、先に作った予約お知らせ（小さいid）が、後から作って
 * 既読にした通常お知らせ（大きいid）に飛び越されて永久に出なくなる。これを防ぐため、
 * 既読は「idの集合」で持つ（バナーに出うるidは有限＝pinnedUntilで自然に失効するため、
 * 呼び出し側で現在バナー対象のidに刈り込んで小さく保つ）。
 *
 * Cookie 形式: "2:5-6-9"（バージョン2＝ハイフン区切りの既読id集合）。
 * 旧形式（単一整数 "6"）は「その値以下は既読」として後方互換で解釈する（AnnouncementBar 側）。
 */
export async function dismissAnnouncements(readIds: number[]) {
  const value = serializeAnnouncementReadIds(readIds);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, value, {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
