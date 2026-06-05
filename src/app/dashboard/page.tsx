import { redirect } from "next/navigation";
import Link from "next/link";
import { getAvatarUrl } from "@/lib/avatar";
import { Globe, User, Heart, ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { PostMethodTabs } from "./PostMethodTabs";
import { MentionSettingsForm } from "./MentionSettingsForm";
import { EmailAddressDisplay } from "./EmailAddressDisplay";
import { BioEditForm } from "./BioEditForm";
import { DefaultsEditor } from "./DefaultsEditor";
import { LocationMapToggle } from "./LocationMapToggle";
import { DisplayModeSelector } from "./DisplayModeSelector";
import prisma from "@/lib/db";
import { calculateStreak } from "@/lib/streak";
import {
  Position,
  FontFamily,
  Color,
  Size,
  Arrangement,
  Visibility,
} from "@/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/?reason=login_required&returnTo=%2Fdashboard");
  }

  // ユーザーのデフォルト設定、bio、統計情報を取得
  const [userWithPreferences, imageCount, postDates, favoritesAgg, topFavoriteImage] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        createdAt: true,
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
        displayMode: true,
      },
    }),
    prisma.image.count({
      where: { userId: user.id },
    }),
    prisma.image.findMany({
      where: { userId: user.id },
      select: { createdAt: true },
    }),
    prisma.image.aggregate({
      where: { userId: user.id },
      _sum: { favoriteCount: true },
    }),
    prisma.image.findFirst({
      where: { userId: user.id, favoriteCount: { gt: 0 } },
      orderBy: { favoriteCount: "desc" },
      select: {
        id: true,
        thumbnailKey: true,
        storageKey: true,
        overlayText: true,
        favoriteCount: true,
      },
    }),
  ]);

  const streak = calculateStreak(postDates.map((p) => p.createdAt));
  const totalFavorites = favoritesAgg._sum.favoriteCount ?? 0;
  const publicUrl = (process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

  // Bot設定を環境変数から取得
  const botUsername = process.env.MASTODON_BOT_ACCT || "pic";
  const botDomain = process.env.MASTODON_BOT_INSTANCE_DOMAIN || "handon.club";
  const botAcct = `${botUsername}@${botDomain}`;

  const emailDomain = "pic-dev.handon.club";

  // メンション設定コンテンツ
  const mentionSettingsContent = (
    <MentionSettingsForm
      botAcct={botAcct}
      userInstanceDomain={user.instance.domain}
    />
  );

  // メール設定コンテンツ
  const emailSettingsContent = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground font-medium">＝＝準備中＝＝</p>
      <EmailAddressDisplay emailPrefix={user.emailPrefix} emailDomain={emailDomain} />
      <div className="text-sm text-muted-foreground">
        <p className="mb-2">このアドレスに画像を添付してメールを送信すると、画像が生成されるようになります（いまはされません）。</p>
        <p className="mb-2 font-medium">メールの形式:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>
            <strong>件名:</strong> オプションをスペース区切りで指定
            <br />
            <span className="text-xs">例: 「下 赤 大 ラノベ」</span>
          </li>
          <li>
            <strong>本文:</strong> 画像に入れるテキスト（1〜140文字）
          </li>
          <li>
            <strong>添付:</strong> 画像ファイル（JPEG/PNG/WebP/HEIC/AVIF）
          </li>
        </ul>
      </div>
      <div className="text-sm">
        <p className="font-medium mb-2">利用可能なオプション:</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="font-medium">位置:</span> 上 下 左 右
          </div>
          <div>
            <span className="font-medium">色:</span> 白 赤 青 緑 黄 茶 桃 橙
          </div>
          <div>
            <span className="font-medium">サイズ:</span> 小 中 大
          </div>
          <div>
            <span className="font-medium">フォント:</span> ふい字 ゴシック ラノベ
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <SiteHeader user={user ? { username: user.username } : null} />
      <div className="container mx-auto px-4 pt-2 pb-8 max-w-2xl">

        {/* セクション1: みる */}
        <section className="mb-4">
          <h2 className="text-lg font-semibold mb-2">みる</h2>
          <div className="bg-muted rounded-lg p-4">
            <div className="grid grid-cols-3 gap-3">
            <Link href="/public">
              <Button variant="outline" className="w-full h-auto py-2 flex flex-col gap-0.5">
                <Globe className="h-5 w-5" />
                <span className="text-sm">みんなの写真</span>
              </Button>
            </Link>
            <Link href={`/u/${user.username}`}>
              <Button variant="outline" className="w-full h-auto py-2 flex flex-col gap-0.5">
                <User className="h-5 w-5" />
                <span className="text-sm">プロフィール</span>
              </Button>
            </Link>
            <Link href="/favorite">
              <Button variant="outline" className="w-full h-auto py-2 flex flex-col gap-0.5">
                <Heart className="h-5 w-5" />
                <span className="text-sm">お気に入り</span>
              </Button>
            </Link>
            </div>
          </div>
        </section>

        {/* セクション2: 投稿する */}
        <section className="mb-4">
          <h2 className="text-lg font-semibold mb-2">投稿する</h2>
          <div className="bg-muted rounded-lg p-4">
            <PostMethodTabs
              instanceDomain={user.instance.domain}
              instanceType={user.instance.type}
              mentionSettingsContent={mentionSettingsContent}
              emailSettingsContent={emailSettingsContent}
            />
          </div>
        </section>

        {/* セクション3: アカウント */}
        <section className="mb-4">
          <h2 className="text-lg font-semibold mb-2">アカウント</h2>
          <div className="relative bg-muted rounded-lg p-4">
            <LogoutButton
              variant="ghost"
              className="absolute top-2 right-2 text-destructive hover:text-destructive"
            />
            <div className="flex items-center gap-4 pr-20">
              {user.avatarUrl && (
                <Link href={`/u/${user.username}`} className="flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getAvatarUrl(user.avatarUrl) ?? user.avatarUrl}
                    alt={user.displayName || user.username}
                    className="w-12 h-12 rounded-full hover:opacity-80 transition-opacity"
                  />
                </Link>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {user.displayName || user.username}
                </p>
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
            {!user.avatarUrl && (
              <p className="text-xs text-muted-foreground mt-3">
                アイコンが表示されていない場合は、ログインし直すと反映されます。
              </p>
            )}
            <div className="mt-3 grid grid-cols-4 gap-x-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">投稿数</p>
                <p className="font-medium">{imageCount}件</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">連続投稿</p>
                <p className="font-medium">{streak}日</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">獲得ふぁぼ</p>
                <p className="font-medium">{totalFavorites}</p>
              </div>
              {userWithPreferences?.createdAt && (
                <div>
                  <p className="text-muted-foreground text-xs">登録日</p>
                  <p className="font-medium">
                    {userWithPreferences.createdAt.toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" })}
                  </p>
                </div>
              )}
            </div>
            {topFavoriteImage && (
              <Link
                href={`/u/${user.username}/status/${topFavoriteImage.id}`}
                className="mt-3 flex items-center gap-3 rounded-lg border overflow-hidden hover:bg-muted/50 transition-colors group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${publicUrl}/${topFavoriteImage.thumbnailKey || topFavoriteImage.storageKey}`}
                  alt={topFavoriteImage.overlayText}
                  className="w-12 h-12 object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">最も人気の投稿</p>
                  <p className="text-sm truncate group-hover:underline">{topFavoriteImage.overlayText}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0 pr-3">
                  <Heart className="h-3 w-3 fill-current" />
                  <span className="font-medium">{topFavoriteImage.favoriteCount}</span>
                </div>
              </Link>
            )}
          </div>
        </section>

        {/* セクション4: 設定 */}
        <section className="mb-4">
          <h2 className="text-lg font-semibold mb-4">設定</h2>

          {/* 一般 */}
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm font-medium mb-2">一般</p>
            <div className="space-y-4">
              <BioEditForm initialBio={userWithPreferences?.bio ?? null} />
              <DisplayModeSelector
                initialMode={
                  (userWithPreferences?.displayMode as "system" | "light" | "dark" | null | undefined) ?? "system"
                }
              />
            </div>
          </div>

          {/* プライバシー・セキュリティ */}
          <div className="mt-4 bg-muted rounded-lg p-4">
            <p className="text-sm font-medium mb-2">プライバシー・セキュリティ</p>
            <div className="space-y-4">
              <Link
                href="/dashboard/sessions"
                className="flex items-center justify-between gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm">ログイン履歴を確認する</p>
                  <p className="text-xs text-muted-foreground">
                    過去のログインセッションを一覧で表示します。
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              </Link>
              <LocationMapToggle
                initialEnabled={userWithPreferences?.showLocationMap ?? false}
                username={user.username}
              />
            </div>
          </div>

          {/* 投稿の初期設定 */}
          <div className="mt-4 bg-muted rounded-lg p-4">
            <p className="text-sm font-medium mb-2">投稿の初期設定</p>
            <DefaultsEditor
              initial={{
                position: userWithPreferences?.defaultPosition as Position | null ?? null,
                font: userWithPreferences?.defaultFont as FontFamily | null ?? null,
                color: userWithPreferences?.defaultColor as Color | null ?? null,
                size: userWithPreferences?.defaultSize as Size | null ?? null,
                arrangement: userWithPreferences?.defaultArrangement as Arrangement | null ?? null,
                visibility: userWithPreferences?.defaultVisibility as Visibility | null ?? null,
                cameraOption: (userWithPreferences?.defaultCameraOption as "none" | "show" | null | undefined) ?? null,
                mentionKeep: userWithPreferences?.mentionKeep ?? false,
              }}
              instanceDomain={user.instance.domain}
            />
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
