/**
 * admin 配下の共通レイアウト。
 *
 * 管理者（ADMIN_ACCTS）判定を1箇所に集約し、非管理者には 404 を返す
 * （各ページで重複していたガードをここへ寄せる）。上部に admin 内ナビを出す。
 */

import { notFound } from "next/navigation";

import Link from "@/components/Link";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

const NAV: { href: string; label: string }[] = [
  { href: "/admin/stats", label: "統計" },
  { href: "/admin/accounts", label: "アカウント" },
  { href: "/admin/servers", label: "サーバー" },
  { href: "/admin/reports", label: "通報" },
  { href: "/admin/favorites", label: "お気に入り" },
];

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
      <nav className="mb-6 flex flex-wrap gap-1 border-b border-border pb-3 text-sm">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {n.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
