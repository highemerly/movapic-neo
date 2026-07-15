"use client";

import Link from "@/components/Link";
import Image from "next/image";
import { Menu, LogIn } from "lucide-react";
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
  // ハンバーガーは共有スライドメニューを開くだけ。PC幅（md+）はメニューを右端の
  // 折りたたみレール（AppRail）に集約しているため、ここのハンバーガーは md 未満のみ表示。
  const { open } = useMenu();

  return (
    <>
      {/* ヘッダーは原則スクロールするが、フッター（BottomNav）が消えるPC幅の非standalone時だけ
          sticky にする（BottomNav は md+・非standalone で非表示＝下部ナビが無い条件と一致）。
          standalone（PWA）は md+ でも BottomNav が出るので static に戻す。 */}
      <header className="border-b bg-background md:sticky md:top-0 md:z-40 standalone:md:static">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* 行の高さは PC レール（AppRail）の開閉トグル（h-12）と揃える。スマホも同じ。 */}
          <div className="flex h-12 items-center justify-between">
            <Link href="/public" className="flex items-center hover:opacity-80 transition-opacity">
              <Image src="/shamezo_logo.svg" alt="SHAMEZO" width={160} height={29} priority />
            </Link>

            <div className="flex items-center gap-2">
              {/* 未ログイン時の主要動線。「ログイン」という語は新規ユーザーへの訴求が弱い
                  （本サービスは独自登録がなく既存 Fediverse アカウントで連携する）ため、
                  行動訴求の「投稿をはじめる」にする。トップのログインフォームへ飛ばし、
                  returnTo=/create でログイン後に投稿ページへ自動遷移する
                  （create/page.tsx の login_required と同じ経路）。
                  ロゴ＋ハンバーガーと並ぶため、狭幅では「はじめる」に短縮して横はみ出しを防ぐ。 */}
              {!user && (
                <Button
                  asChild
                  size="sm"
                  className="bg-brand text-brand-foreground hover:bg-brand/90"
                >
                  <Link href="/?reason=login_required&returnTo=%2Fcreate">
                    <LogIn className="h-4 w-4" />
                    {/* ラベルは1つの span にまとめる。直下に置くと flex の gap が
                        「投稿を」と「はじめる」の間に入り不自然な空きになるため。 */}
                    <span>
                      <span className="hidden min-[380px]:inline">投稿を</span>はじめる
                    </span>
                  </Link>
                </Button>
              )}
              {/* 通知ベルは md 未満のみ。PC幅は右端レール（AppRail）の「通知」に既読管理ごと集約。 */}
              {user && (
                <span className="md:hidden">
                  <NotificationBell />
                </span>
              )}
              {/* ハンバーガーは md 未満のみ。PC幅は右端の折りたたみレール（AppRail）に集約。 */}
              <Button
                variant="outline"
                size="icon"
                className="md:hidden"
                onClick={open}
                aria-haspopup="dialog"
              >
                <Menu className="size-5" />
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
