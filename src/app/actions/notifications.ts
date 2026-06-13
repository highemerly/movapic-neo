"use server";

import { cookies } from "next/headers";

// ベルを最後に開いた時刻(ISO)。これより新しい獲得実績があれば赤ドットを出す。
const COOKIE_NAME = "not";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1年

/** ベルを開いた時に呼ぶ。最終確認時刻を現在に更新し、赤ドットを消す。 */
export async function markNotificationsSeen(seenAtIso: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, seenAtIso, {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
