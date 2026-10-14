/**
 * 管理画面（/admin）のガード。非管理者には 404 を返す。
 *
 * layout だけで判定してはいけない: RSC リクエストは `Next-Router-State-Tree` ヘッダで
 * 「クライアントが既に持っている階層」を申告でき、その階層の layout は描画されない。
 * 申告内容は検証されないため、layout の notFound() を飛ばしてページ本体だけを
 * 描画させられる（未ログインで通報一覧等が読めた）。データを読む各ページで必ず呼ぶ。
 */

import { notFound } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";

export async function requireAdmin(): Promise<void> {
  const currentUser = await getCurrentUser();
  const acct = currentUser
    ? `${currentUser.username}@${currentUser.instance.domain}`
    : null;
  if (!isAdmin(acct)) {
    notFound();
  }
}
