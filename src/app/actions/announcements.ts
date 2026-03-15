"use server";

import { cookies } from "next/headers";

const COOKIE_NAME = "ann";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30日

export async function dismissAnnouncements(lastReadId: number) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, String(lastReadId), {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
