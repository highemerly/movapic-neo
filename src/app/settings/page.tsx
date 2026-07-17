import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { User, Palette, ShieldCheck, SlidersHorizontal, Lock, type LucideIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getAvatarUrl } from "@/lib/avatar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { InstallEntry } from "@/components/pwa/InstallEntry";
import { RetryImg } from "@/components/RetryImg";
import Link from "@/components/Link";
import { SettingLinkRow } from "@/components/SettingRow";
import { userPathSegment } from "@/lib/userHandle";
import { getHomeServer } from "@/lib/auth/serverPolicy";
import { getEmailDomain } from "@/lib/postMethods";
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
  CameraOption,
} from "@/types";

export const dynamic = "force-dynamic";

// 見出し帯（別背景色）と本文を1枚のカードとして地続きに見せるセクション。
// 見出しの bg-muted と本文の bg-background を border で囲い、header の border-b で
// 帯と本文を繋ぐ。以前は見出しが本文と同じ muted 背景に埋もれ、境界が曖昧だった。
function SettingsSection({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="mb-4 scroll-mt-16 md:scroll-mt-28 rounded-lg border overflow-hidden bg-background"
    >
      <div className="flex items-center gap-1.5 border-b bg-muted px-4 py-2.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-bold">{title}</span>
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

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
  const selfSeg = userPathSegment(user.username, user.instance.domain, getHomeServer());
  const emailDomain = getEmailDomain();
  const avatarUrl = getAvatarUrl(user.avatarUrl);

  return (
    <>
      <SiteHeader user={{ username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) }} />
      <div className="container mx-auto px-4 pt-2 pb-8 max-w-2xl">
        <h1 className="text-lg font-semibold mb-2">設定</h1>

        {/* セクション見出しへのジャンプナビ（ページ内アンカー） */}
        <SettingsNav />

        {/* プロフィール */}
        <SettingsSection id="profile" icon={User} title="プロフィール">
          {/* ユーザー情報は表示のみ（設定項目ではない）なので枠を付けない */}
          <div className="flex items-center gap-3">
            <Link
              href={`/u/${selfSeg}`}
              className="flex-shrink-0"
              aria-label="自分のページを開く"
            >
              {avatarUrl ? (
                <RetryImg
                  src={avatarUrl}
                  alt={user.displayName || user.username}
                  className="h-12 w-12 rounded-full"
                />
              ) : (
                <span className="h-12 w-12 rounded-full bg-muted block" aria-hidden />
              )}
            </Link>
            <div className="min-w-0">
              <p className="font-medium truncate">{user.displayName || user.username}</p>
              <a
                href={`https://${user.instance.domain}/@${user.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs text-muted-foreground hover:underline truncate"
              >
                @{user.username}@{user.instance.domain}
              </a>
            </div>
          </div>
          <BioEditForm initialBio={preferences?.bio ?? null} />
        </SettingsSection>

        {/* 外観（テーマ・タイムライン表示。ブラウザローカル設定） */}
        <SettingsSection id="appearance" icon={Palette} title="外観">
          <DisplayModeSelector />
        </SettingsSection>

        {/* 投稿設定 */}
        <SettingsSection id="defaults" icon={SlidersHorizontal} title="投稿設定">
          <DefaultsEditor
            initial={{
              position: preferences?.defaultPosition as Position | null ?? null,
              font: preferences?.defaultFont as FontFamily | null ?? null,
              color: preferences?.defaultColor as Color | null ?? null,
              size: preferences?.defaultSize as Size | null ?? null,
              arrangement: preferences?.defaultArrangement as Arrangement | null ?? null,
              visibility: preferences?.defaultVisibility as Visibility | null ?? null,
              cameraOption: (preferences?.defaultCameraOption as CameraOption | null | undefined) ?? null,
              mentionKeep: preferences?.mentionKeep ?? false,
            }}
            instanceDomain={user.instance.domain}
          />
          {/* カレンダーの自動穴埋めも投稿時の挙動なので投稿系に置く */}
          <AutoMakeupToggle
            initialEnabled={preferences?.autoMakeup ?? true}
          />
          {/* 投稿用メールアドレス（確認＋再生成）。メール投稿の設定なので投稿設定に置く。
              メール投稿が未提供（EMAIL_DOMAIN 未設定）の環境では出さない */}
          {emailDomain && (
            <EmailPrefixRegenerate emailPrefix={user.emailPrefix} emailDomain={emailDomain} />
          )}
        </SettingsSection>

        {/* プライバシー（公開範囲のオプトイン設定） */}
        <SettingsSection id="privacy" icon={ShieldCheck} title="プライバシー">
          <LocationMapToggle
            initialEnabled={preferences?.showLocationMap ?? false}
            username={selfSeg}
          />
          <BlockCrawlersToggle
            initialEnabled={preferences?.blockCrawlers ?? false}
          />
        </SettingsSection>

        {/* アカウント・セキュリティ（ログイン履歴・投稿用メール・アプリ導入・退会） */}
        <SettingsSection id="account" icon={Lock} title="アカウント・セキュリティ">
          {/* 控えめなインストール導線（Android/iOS Safari・未インストール時のみ表示） */}
          <InstallEntry />
          <SettingLinkRow
            href="/settings/mutes"
            title="ミュートを管理する"
            description="ミュート中のユーザーを確認し、解除できます。"
          />
          <SettingLinkRow
            href="/settings/sessions"
            title="ログイン履歴を確認する"
            description="直近90日のログインを確認し、身に覚えのないセッションを失効できます。"
          />
          {/* 退会は破線で区切り、他の設定と同じ視覚的重みにならないよう最下部に隔離 */}
          <div className="border-t border-dashed border-destructive/30 pt-4">
            <SettingLinkRow
              href="/settings/delete"
              tone="destructive"
              title="アカウントを削除する"
              description="投稿・実績を含む全データを削除します。この操作は取り消せません。"
            />
          </div>
        </SettingsSection>

        <Footer />
      </div>
    </>
  );
}
