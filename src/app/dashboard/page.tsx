import { redirect } from "next/navigation";
import Link from "@/components/Link";
import { getAvatarUrl } from "@/lib/avatar";
import { Globe, Server, Heart, ChevronRight, Settings2, ShieldCheck, SlidersHorizontal, Trophy, Images, Calendar, Map as MapIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { PostMethodTabs } from "./PostMethodTabs";
import { MentionSettingsForm } from "./MentionSettingsForm";
import { EmailAddressDisplay } from "./EmailAddressDisplay";
import { EmailPrefixRegenerate } from "./EmailPrefixRegenerate";
import { BioEditForm } from "./BioEditForm";
import { DefaultsEditor } from "./DefaultsEditor";
import { LocationMapToggle } from "./LocationMapToggle";
import { DisplayModeSelector } from "./DisplayModeSelector";
import prisma from "@/lib/db";
import { getUserProfileStats } from "@/lib/userStats";
import { userPathSegment } from "@/lib/userHandle";
import { hasRecentPerfectAttendance } from "@/lib/achievements/lastMonthPerfect";
import { AttendanceCrown } from "@/components/user/AttendanceCrown";
import {
  Position,
  FontFamily,
  Color,
  Size,
  Arrangement,
  Visibility,
} from "@/types";

export const dynamic = "force-dynamic";

// 配列からランダムに最大 n 件を取り出す（force-dynamic なのでリクエストごとに入れ替わる）。
// 描画関数の外に切り出して、render 中の不純呼び出し（react-hooks/purity）を避ける。
function pickRandomSample<T>(items: T[], n: number): T[] {
  return [...items].sort(() => Math.random() - 0.5).slice(0, n);
}

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/?reason=login_required&returnTo=%2Fdashboard");
  }

  // ユーザーのデフォルト設定、bio、統計情報を取得
  // 投稿数・連続投稿・都道府県数・実績数はユーザーページの各タブと共通の集計（getUserProfileStats）
  const [userWithPreferences, profileStats, favoritesAgg, topFavoriteImage, recentPublicImages, perfectAttendance] = await Promise.all([
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
      },
    }),
    getUserProfileStats(user.id),
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
    // 「みんなの投稿」プレビュー用に直近の公開投稿を取得（この中からランダムで4枚出す）
    prisma.image.findMany({
      where: { isPublic: true, isDisabled: false },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        thumbnailKey: true,
        storageKey: true,
        overlayText: true,
        user: { select: { username: true, instance: { select: { domain: true } } } },
      },
    }),
    hasRecentPerfectAttendance(user.id),
  ]);

  // 自分の /u/ パスセグメント（既定インスタンスは素のusername、他は username@domain）
  const selfSeg = userPathSegment(user.username, user.instance.domain);
  const totalFavorites = favoritesAgg._sum.favoriteCount ?? 0;
  // 直近20投稿からランダムに最大5枚（モバイル4列/PC5列。5枚目はモバイルでは非表示）
  const previewImages = pickRandomSample(recentPublicImages, 5);
  const publicUrl = (process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

  // Bot設定を環境変数から取得
  const botUsername = process.env.MASTODON_BOT_ACCT || "pic";
  const botDomain = process.env.MASTODON_BOT_INSTANCE_DOMAIN || "handon.club";
  const botAcct = `${botUsername}@${botDomain}`;

  const emailDomain = process.env.EMAIL_DOMAIN || "pic.handon.club";
  const emailAddress = `${user.emailPrefix}@${emailDomain}`;
  const mailtoPlain = `mailto:${emailAddress}?body=${encodeURIComponent("マックチキン！")}`;
  const mailtoWithOptions = `mailto:${emailAddress}?subject=${encodeURIComponent("下 赤 大 都道府県")}&body=${encodeURIComponent("マックチキン！")}`;

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
      <p className="text-sm text-muted-foreground">
        あなた専用に発行されたメールアドレスに画像を添付して送信するだけで、コメントを合成した写真が投稿されます。
      </p>

      <div className="text-sm space-y-3">
        <p className="font-medium">メールの形式:</p>
        <ul className="list-disc list-inside space-y-2 ml-2">
          <EmailAddressDisplay emailPrefix={user.emailPrefix} emailDomain={emailDomain} />
          <li>
            <strong>本文:</strong> 画像に入れるテキスト（〜140文字）
          </li>
          <li>
            <strong>添付:</strong> 画像ファイル1枚
          </li>
        </ul>
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <code className="block text-xs bg-background p-2 rounded border whitespace-pre-line">
            {"本文：マックチキン！"}
          </code>
          <a
            href={mailtoPlain}
            className="inline-block text-xs text-primary hover:underline"
          >
            → メールアプリで送信する
          </a>
        </div>
      </div>

      <div className="text-sm space-y-3">
        <p className="font-medium">オプション:</p>
        <p className="text-muted-foreground">件名にスペース区切りでオプションを指定することもできます（指定がない場合は「投稿の初期設定」に従います）。</p>
        <ul className="list-disc list-inside space-y-2 ml-2">
          <li>
            <strong>位置:</strong> 上 下 左 右
          </li>
          <li>
            <strong>色:</strong> 白 赤 青 緑 黄 茶 桃 橙
          </li>
          <li>
            <strong>サイズ:</strong> 小 中 大 特大
          </li>
          <li>
            <strong>フォント:</strong> ふい字 ゴシック ラノベ
          </li>
          <li>
            <strong>アレンジ:</strong> ネオン ハンコ
          </li>
          <li>
            <strong>公開範囲:</strong> public unlisted
          </li>
          <li>
            <strong>カメラ機種:</strong> カメラ カメラなし
          </li>
          <li>
            <strong>位置情報:</strong> 都道府県 市町村
          </li>
        </ul>
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <code className="block text-xs bg-background p-2 rounded border whitespace-pre-line">
            {"件名：下 赤 大 都道府県\n本文：マックチキン！"}
          </code>
          <a
            href={mailtoWithOptions}
            className="inline-block text-xs text-primary hover:underline"
          >
            → メールアプリで送信する
          </a>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <SiteHeader user={user ? { username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) } : null} />
      <div className="container mx-auto px-4 pt-2 pb-8 max-w-2xl">

        {/* セクション1: あなたの情報 */}
        <section className="mb-4">
          <h2 className="text-lg font-semibold mb-2">あなたの情報</h2>
          <div className="relative bg-muted rounded-lg p-4">
            <LogoutButton
              variant="ghost"
              className="absolute top-2 right-2 text-destructive hover:text-destructive"
            />
            <div className="flex items-center gap-4 pr-20">
              {user.avatarUrl && (
                <div className="relative flex-shrink-0">
                  {/* prefetch は下のスタットボタン（同一URL /u/[selfSeg]）に集約。
                      同じURLを2箇所で prefetch すると両方が同時に発火して二重リクエストになる。 */}
                  <Link href={`/u/${selfSeg}`} className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getAvatarUrl(user.avatarUrl) ?? user.avatarUrl}
                      alt={user.displayName || user.username}
                      className="w-12 h-12 rounded-full hover:opacity-80 transition-opacity"
                    />
                  </Link>
                  {perfectAttendance && <AttendanceCrown />}
                </div>
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
            <div className="mt-3 grid grid-cols-4 gap-2">
              <Link href={`/u/${selfSeg}`} prefetch>
                <Button variant="outline" className="w-full h-14 flex flex-col gap-0.5" aria-label="一覧" title="投稿数">
                  <Images className="h-5 w-5" />
                  <span className="leading-none whitespace-nowrap">
                    <span className="text-sm font-semibold tabular-nums">{profileStats.imageCount}</span>
                    <span className="text-[10px]">枚</span>
                  </span>
                </Button>
              </Link>
              <Link href={`/u/${selfSeg}/calendar`} prefetch>
                <Button variant="outline" className="w-full h-14 flex flex-col gap-0.5" aria-label="カレンダー" title="連続投稿日数">
                  <Calendar className="h-5 w-5" />
                  <span className="leading-none whitespace-nowrap">
                    <span className="text-[10px]">連続</span>
                    <span className="text-sm font-semibold tabular-nums">{profileStats.streak}</span>
                    <span className="text-[10px]">日</span>
                  </span>
                </Button>
              </Link>
              <Link href={`/u/${selfSeg}/map`} prefetch>
                <Button variant="outline" className="w-full h-14 flex flex-col gap-0.5" aria-label="地図" title="都道府県数">
                  <MapIcon className="h-5 w-5" />
                  <span className="leading-none whitespace-nowrap">
                    <span className="text-sm font-semibold tabular-nums">{profileStats.prefectureCount}</span>
                    <span className="text-[10px]">カ所</span>
                  </span>
                </Button>
              </Link>
              <Link href={`/u/${selfSeg}/achievements`} prefetch>
                <Button variant="outline" className="w-full h-14 flex flex-col gap-1 justify-center" aria-label="実績" title="獲得実績（金・銀）">
                  <span className="flex items-center gap-1 leading-none whitespace-nowrap">
                    <Trophy className="h-3.5 w-3.5 fill-amber-400 text-amber-600" />
                    <span className="text-sm font-semibold tabular-nums">{profileStats.goldCount}</span>
                  </span>
                  <span className="flex items-center gap-1 leading-none whitespace-nowrap">
                    <Trophy className="h-3.5 w-3.5 fill-slate-300 text-slate-500" />
                    <span className="text-sm font-semibold tabular-nums">{profileStats.silverCount}</span>
                  </span>
                </Button>
              </Link>
            </div>
            {topFavoriteImage && (
              <Link
                href={`/u/${selfSeg}/status/${topFavoriteImage.id}`}
                prefetch
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
            <p className="mt-3 text-xs text-muted-foreground">
              {userWithPreferences?.createdAt &&
                `${userWithPreferences.createdAt.toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" })}に登録・`}
              獲得お気に入り{totalFavorites}件
            </p>
          </div>
        </section>

        {/* セクション2: 投稿する */}
        <section className="mb-4">
          <h2 className="text-lg font-semibold mb-2">投稿する</h2>
          <div className="bg-muted rounded-lg p-4">
            <PostMethodTabs
              instanceType={user.instance.type}
              mentionSettingsContent={mentionSettingsContent}
              emailSettingsContent={emailSettingsContent}
            />
          </div>
        </section>

        {/* セクション3: みんなの投稿をみる */}
        <section className="mb-4">
          <h2 className="text-lg font-semibold mb-2">みんなの投稿をみる</h2>
          <div className="bg-muted rounded-lg p-4">
            <div className="grid grid-cols-3 gap-3">
            <Link href="/public">
              <Button variant="outline" className="w-full h-16 flex flex-col gap-1 justify-center">
                <Globe className="h-5 w-5" />
                <span className="text-sm">みんな</span>
              </Button>
            </Link>
            <Link href={`/public?instances=${encodeURIComponent(user.instance.domain)}`}>
              <Button variant="outline" className="w-full h-16 flex flex-col gap-1 justify-center">
                <Server className="h-5 w-5" />
                <span className="w-full whitespace-normal break-all text-center text-[11px] leading-tight line-clamp-2">
                  {user.instance.domain}のみ
                </span>
              </Button>
            </Link>
            <Link href="/favorite">
              <Button variant="outline" className="w-full h-16 flex flex-col gap-1 justify-center">
                <Heart className="h-5 w-5" />
                <span className="text-sm">お気に入り</span>
              </Button>
            </Link>
            </div>

            {/* 「みんな」ボタンからの吹き出し：直近の公開投稿サムネイル */}
            {previewImages.length > 0 && (
              <div className="relative mt-3">
                <div className="absolute -top-1.5 left-[16.66%] h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t bg-background" />
                <div className="rounded-lg border bg-background p-3">
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                    {previewImages.map((img, index) => (
                      <Link
                        key={img.id}
                        href={`/u/${userPathSegment(img.user.username, img.user.instance.domain)}/status/${img.id}`}
                        className={`overflow-hidden rounded-md border transition-opacity hover:opacity-80 ${
                          index === 4 ? "hidden sm:block" : "block"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`${publicUrl}/${img.thumbnailKey || img.storageKey}`}
                          alt={img.overlayText}
                          className="aspect-square w-full object-cover"
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* セクション4: 設定を変更する */}
        <section className="mb-4">
          <h2 className="text-lg font-semibold mb-2">設定を変更する</h2>

          {/* 一般 */}
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm font-bold mb-4 flex items-center gap-1.5">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              一般
            </p>
            <div className="space-y-4">
              <BioEditForm initialBio={userWithPreferences?.bio ?? null} />
              <DisplayModeSelector />
            </div>
          </div>

          {/* プライバシー・セキュリティ */}
          <div className="mt-4 bg-muted rounded-lg p-4">
            <p className="text-sm font-bold mb-4 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              プライバシー・セキュリティ
            </p>
            <div className="space-y-4">
              <Link
                href="/dashboard/sessions"
                className="flex items-center justify-between gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm">ログイン履歴を確認する</p>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              </Link>
              <EmailPrefixRegenerate />
              <LocationMapToggle
                initialEnabled={userWithPreferences?.showLocationMap ?? false}
                username={selfSeg}
              />
            </div>
          </div>

          {/* 投稿の初期設定 */}
          <div className="mt-4 bg-muted rounded-lg p-4">
            <p className="text-sm font-bold mb-4 flex items-center gap-1.5">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              投稿の初期設定
            </p>
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
