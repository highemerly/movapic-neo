/**
 * admin 配下の共通レイアウト。
 *
 * 管理者（ADMIN_ACCTS）判定を1箇所に集約し、非管理者には 404 を返す
 * （各ページで重複していたガードをここへ寄せる）。上部に admin 内ナビを出す。
 */

import { notFound } from "next/navigation";

import { AdminNav } from "@/app/admin/_components/AdminNav";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await getCurrentUser();
  const acct = currentUser
    ? `${currentUser.username}@${currentUser.instance.domain}`
    : null;
  if (!isAdmin(acct)) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <AdminNav />
      {children}
    </div>
  );
}
