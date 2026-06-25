"use client";

import Link from "@/components/Link";
import Image from "next/image";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnnouncementBar } from "./AnnouncementBar";
import { NotificationBell } from "./NotificationBell";
import { useMenu } from "./AppMenu";

type SiteHeaderProps = {
  user?: {
    username: string;
    /** ログインユーザーの所属サーバードメイン。互換のため受け取るが表示には未使用 */
    instanceDomain?: string;
    /** ログインユーザーのアバター画像URL（プロキシ済み）。互換のため受け取るが表示には未使用 */
    avatarUrl?: string | null;
  } | null;
};

export function SiteHeader({ user }: SiteHeaderProps = {}) {
  // メニューの中身（アカウント欄・各動線）は layout の MenuProvider から供給され、
  // ハンバーガーは共有スライドメニューを開くだけ。
  const { open } = useMenu();

  return (
    <>
      {/* ヘッダーは原則スクロールするが、フッター（BottomNav）が消えるPC幅の非standalone時だけ
          sticky にする（BottomNav は md+・非standalone で非表示＝下部ナビが無い条件と一致）。
          standalone（PWA）は md+ でも BottomNav が出るので static に戻す。 */}
      <header className="border-b bg-background md:sticky md:top-0 md:z-40 standalone:md:static">
        <div className="container mx-auto px-4 py-1 max-w-6xl">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center hover:opacity-80 transition-opacity">
              <Image src="/shamezo_logo.svg" alt="SHAMEZO" width={160} height={29} priority />
            </Link>

            <div className="flex items-center gap-2">
              {user && <NotificationBell />}
              <Button
                variant="outline"
                size="icon"
                onClick={open}
                aria-haspopup="dialog"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">メニューを開く</span>
              </Button>
            </div>
          </div>
        </div>
      </header>
      <AnnouncementBar />
    </>
  );
}
