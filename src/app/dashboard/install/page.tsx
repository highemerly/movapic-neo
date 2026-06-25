import { redirect } from "next/navigation";
import Link from "@/components/Link";
import { ChevronLeft, Share, Plus, MoreHorizontal } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";

export const dynamic = "force-dynamic";

const STEPS: { body: React.ReactNode }[] = [
  {
    body: (
      <span className="flex flex-wrap items-center gap-1.5">
         （<Share className="inline h-4 w-4" aria-label="共有" />
        「共有」が表示されていない場合）
        <MoreHorizontal className="inline h-4 w-4" aria-label="メニュー" />
        メニューボタンをタップします。
      </span>
    ),
  },
  {
    body: (
      <span className="flex flex-wrap items-center gap-1.5">
        <Share className="inline h-4 w-4" aria-label="共有" />
        共有をタップします。
      </span>
    ),
  },
  {
    body: (
      <span className="flex flex-wrap items-center gap-1.5">
        下にスクロールし、
        <Plus className="inline h-4 w-4" aria-label="追加" />
        ホーム画面に追加をタップします。
      </span>
    ),
  },
  {
    body: <span>右上の「追加」をタップして完了です。</span>,
  },
];

/**
 * iOS Safari 向けの「ホーム画面に追加」手順ページ。
 * dashboard の控えめなインストール導線（InstallEntry）から遷移してくる。
 */
export default async function InstallGuidePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  return (
    <>
      <SiteHeader
        user={{
          username: user.username,
          instanceDomain: user.instance.domain,
          avatarUrl: getAvatarUrl(user.avatarUrl),
        }}
      />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            ダッシュボード
          </Link>
        </div>

        <h1 className="text-lg font-semibold mb-2">ホーム画面に追加する</h1>
        <p className="text-muted-foreground mb-6">
          SHAMEZOをアプリのように利用しましょう！iPhone・iPad では、 Safari で次のとおり操作してみてください。
        </p>

        <ol className="space-y-3">
          {STEPS.map((step, i) => (
            <li
              key={i}
              className="flex items-start gap-3 bg-muted rounded-lg p-4 text-sm"
            >
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              {step.body}
            </li>
          ))}
        </ol>

        <p className="text-xs text-muted-foreground mt-6">
          ※ iOS Chrome など Safari 以外のブラウザは非対応です。
        </p>

        <Footer />
      </div>
    </>
  );
}
