import { redirect } from "next/navigation";
import Link from "next/link";
import { Globe, User, Heart } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { PostMethodTabs } from "./PostMethodTabs";
import { MentionSettingsForm } from "./MentionSettingsForm";
import { EmailAddressDisplay } from "./EmailAddressDisplay";
import { BioEditForm } from "./BioEditForm";
import { PreferencesResetButton } from "./PreferencesResetButton";
import prisma from "@/lib/db";
import {
  POSITION_LABELS,
  FONT_LABELS,
  COLOR_LABELS,
  SIZE_LABELS,
  OUTPUT_LABELS,
  ARRANGEMENT_LABELS,
  Position,
  FontFamily,
  Color,
  Size,
  OutputFormat,
  Arrangement,
} from "@/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  // ユーザーのデフォルト設定、bio、統計情報を取得
  const [userWithPreferences, imageCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        createdAt: true,
        bio: true,
        mentionVisibility: true,
        mentionKeep: true,
        defaultPosition: true,
        defaultFont: true,
        defaultColor: true,
        defaultSize: true,
        defaultOutput: true,
        defaultArrangement: true,
      },
    }),
    prisma.image.count({
      where: { userId: user.id },
    }),
  ]);

  // Bot設定を環境変数から取得
  const botUsername = process.env.MASTODON_BOT_ACCT || "pic";
  const botDomain = process.env.MASTODON_BOT_INSTANCE_DOMAIN || "handon.club";
  const botAcct = `${botUsername}@${botDomain}`;

  const hasPreferences = userWithPreferences && (
    userWithPreferences.defaultPosition ||
    userWithPreferences.defaultFont ||
    userWithPreferences.defaultColor ||
    userWithPreferences.defaultSize ||
    userWithPreferences.defaultOutput ||
    userWithPreferences.defaultArrangement
  );

  const emailDomain = "pic-dev.handon.club";

  // メンション設定コンテンツ
  const mentionSettingsContent = (
    <MentionSettingsForm
      initialVisibility={userWithPreferences?.mentionVisibility as "public" | "unlisted" | "local" ?? "public"}
      initialKeep={userWithPreferences?.mentionKeep ?? false}
      botAcct={botAcct}
      userInstanceDomain={user.instance.domain}
    />
  );

  // メール設定コンテンツ
  const emailSettingsContent = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground font-medium">準備中</p>
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
      <div className="container mx-auto px-4 py-8 max-w-2xl">

        {/* セクション1: みる */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">みる</h2>
          <div className="bg-muted rounded-lg p-4">
            <div className="grid grid-cols-3 gap-3">
            <Link href="/public">
              <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2">
                <Globe className="h-5 w-5" />
                <span className="text-sm">みんなの写真</span>
              </Button>
            </Link>
            <Link href={`/u/${user.username}`}>
              <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2">
                <User className="h-5 w-5" />
                <span className="text-sm">わたしの写真</span>
              </Button>
            </Link>
            <Link href="/favorite">
              <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2">
                <Heart className="h-5 w-5" />
                <span className="text-sm">お気に入り</span>
              </Button>
            </Link>
            </div>
          </div>
        </section>

        {/* セクション2: 投稿する */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-1">投稿する</h2>
          <p className="text-xs text-muted-foreground mb-4">
            好きな方法で写真とコメントをアップロードしましょう。
          </p>
          <div className="bg-muted rounded-lg p-4">
            <PostMethodTabs
              instanceDomain={user.instance.domain}
              mentionSettingsContent={mentionSettingsContent}
              emailSettingsContent={emailSettingsContent}
            />
          </div>
        </section>

        {/* セクション3: アカウント */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">アカウント</h2>
          <div className="bg-muted rounded-lg p-4">
            <div className="flex items-center gap-4">
              {user.avatarUrl && (
                <Link href={`/u/${user.username}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={user.avatarUrl}
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
                  className="text-sm text-muted-foreground hover:underline"
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
            <div className="mt-4 flex gap-6 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">投稿数</p>
                <p className="font-medium">{imageCount}件</p>
              </div>
              {userWithPreferences?.createdAt && (
                <div>
                  <p className="text-muted-foreground text-xs">登録日</p>
                  <p className="font-medium">
                    {userWithPreferences.createdAt.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-4">
              <LogoutButton />
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <BioEditForm initialBio={userWithPreferences?.bio ?? null} />
            </div>
          </div>
        </section>

        {/* セクション4: 設定 */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">設定</h2>
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm font-medium mb-3">投稿のデフォルト設定</p>
            {hasPreferences ? (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">位置</dt>
                    <dd className="font-medium">
                      {userWithPreferences.defaultPosition
                        ? POSITION_LABELS[userWithPreferences.defaultPosition as Position]
                        : "システム標準"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">フォント</dt>
                    <dd className="font-medium">
                      {userWithPreferences.defaultFont
                        ? FONT_LABELS[userWithPreferences.defaultFont as FontFamily]
                        : "システム標準"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">色</dt>
                    <dd className="font-medium">
                      {userWithPreferences.defaultColor
                        ? COLOR_LABELS[userWithPreferences.defaultColor as Color]
                        : "システム標準"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">サイズ</dt>
                    <dd className="font-medium">
                      {userWithPreferences.defaultSize
                        ? SIZE_LABELS[userWithPreferences.defaultSize as Size]
                        : "システム標準"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">出力形式</dt>
                    <dd className="font-medium">
                      {userWithPreferences.defaultOutput
                        ? OUTPUT_LABELS[userWithPreferences.defaultOutput as OutputFormat]
                        : "システム標準"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">アレンジ</dt>
                    <dd className="font-medium">
                      {userWithPreferences.defaultArrangement
                        ? ARRANGEMENT_LABELS[userWithPreferences.defaultArrangement as Arrangement]
                        : "システム標準"}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-muted-foreground">
                  変更は<Link href="/create" className="text-primary hover:underline">Web投稿画面</Link>から
                </p>
                <PreferencesResetButton />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                未設定です。<Link href="/create" className="text-primary hover:underline">Web投稿画面</Link>で「初期値として保存」を押すと設定できます。
              </p>
            )}
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
