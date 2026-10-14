/**
 * admin 配下の共通レイアウト。
 *
 * 非管理者には 404 を返し、上部に admin 内ナビを出す。
 * layout の判定は RSC ヘッダで迂回できるため、各 page.tsx でも requireAdmin() を呼ぶ。
 */

import { AdminNav } from "@/app/admin/_components/AdminNav";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 通常表示で admin ナビごと 404 にするため。ここは迂回され得るので各ページでも必ず判定する
  // （requireAdmin の doc 参照）。
  await requireAdmin();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <AdminNav />
      {children}
    </div>
  );
}
