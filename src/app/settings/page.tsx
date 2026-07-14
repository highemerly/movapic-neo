import { redirect } from "next/navigation";
import Link from "@/components/Link";
import { ChevronRight, Settings2, Palette, ShieldCheck, SlidersHorizontal, Trash2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getAvatarUrl } from "@/lib/avatar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { InstallEntry } from "@/components/pwa/InstallEntry";
import { userPathSegment } from "@/lib/userHandle";
import prisma from "@/lib/db";
import { BioEditForm } from "./BioEditForm";
import { AutoMakeupToggle } from "./AutoMakeupToggle";
import { DisplayModeSelector } from "./DisplayModeSelector";
import { EmailPrefixRegenerate } from "./EmailPrefixRegenerate";
import { LocationMapToggle } from "./LocationMapToggle";
import { BlockCrawlersToggle } from "./BlockCrawlersToggle";
import { DefaultsEditor } from "./DefaultsEditor";
import { SettingsNav } from "./SettingsNav";
import {
  Position,
  FontFamily,
  Color,
  Size,
  Arrangement,
  Visibility,
} from "@/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/?reason=login_required&returnTo=%2Fsettings");
  }

  const preferences = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      bio: true,
      mentionKeep: true,
      defaultPosition: true,
      defaultFont: true,
      defaultColor: true,
      defaultSize: true,
      defaultArrangement: true,
      defaultVisibility: true,
      defaultCameraOption: true,
      showLocationMap: true,
      blockCrawlers: true,
      autoMakeup: true,
    },
  });

  // 自分の /u/ パスセグメント（LocationMapToggle の「自分の地図」リンク用）
  const selfSeg = userPathSegment(user.username, user.instance.domain);

  return (
    <>
      <SiteHeader user={{ username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) }} />
      <div className="container mx-auto px-4 pt-2 pb-8 max-w-2xl">
        <h1 className="text-lg font-semibold mb-2">設定</h1>

        {/* セクション見出しへのジャンプナビ（ページ内アンカー） */}
        <SettingsNav />

        {/* 一般 */}
        <section id="general" className="mb-4 scroll-mt-16 md:scroll-mt-28">
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm font-bold mb-4 flex items-center gap-1.5">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              一般
            </p>
            <div className="space-y-4">
              <BioEditForm initialBio={preferences?.bio ?? null} />
              <AutoMakeupToggle
                initialDisabled={!(preferences?.autoMakeup ?? true)}
              />
              {/* 控えめなインストール導線（Android/iOS Safari・未インストール時のみ表示） */}
              <InstallEntry />
            </div>
          </div>
        </section>

        {/* 外観（テーマ・タイムライン表示。ブラウザローカル設定） */}
        <section id="appearance" className="mb-4 scroll-mt-16 md:scroll-mt-28">
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm font-bold mb-4 flex items-center gap-1.5">
              <Palette className="h-4 w-4 text-muted-foreground" />
              外観
            </p>
            <DisplayModeSelector />
          </div>
        </section>

        {/* プライバシー・セキュリティ */}
        <section id="privacy" className="mb-4 scroll-mt-16 md:scroll-mt-28">
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm font-bold mb-4 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              プライバシー・セキュリティ
            </p>
            <div className="space-y-4">
              <Link
                href="/settings/sessions"
                className="flex items-center justify-between gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm">ログイン履歴を確認する</p>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              </Link>
              <EmailPrefixRegenerate />
              <LocationMapToggle
                initialEnabled={preferences?.showLocationMap ?? false}
                username={selfSeg}
              />
              <BlockCrawlersToggle
                initialEnabled={preferences?.blockCrawlers ?? false}
              />
            </div>
          </div>
        </section>

        {/* 投稿の初期設定 */}
        <section id="defaults" className="mb-4 scroll-mt-16 md:scroll-mt-28">
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm font-bold mb-4 flex items-center gap-1.5">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              投稿の初期設定
            </p>
            <DefaultsEditor
              initial={{
                position: preferences?.defaultPosition as Position | null ?? null,
                font: preferences?.defaultFont as FontFamily | null ?? null,
                color: preferences?.defaultColor as Color | null ?? null,
                size: preferences?.defaultSize as Size | null ?? null,
                arrangement: preferences?.defaultArrangement as Arrangement | null ?? null,
                visibility: preferences?.defaultVisibility as Visibility | null ?? null,
                cameraOption: (preferences?.defaultCameraOption as "none" | "show" | null | undefined) ?? null,
                mentionKeep: preferences?.mentionKeep ?? false,
              }}
              instanceDomain={user.instance.domain}
            />
          </div>
        </section>

        {/* アカウント削除 */}
        <section id="account" className="mb-4 scroll-mt-16 md:scroll-mt-28">
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm font-bold mb-4 flex items-center gap-1.5">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
              アカウント削除
            </p>
            <Link
              href="/settings/delete"
              className="flex items-center justify-between gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm">アカウントを削除する</p>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            </Link>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
