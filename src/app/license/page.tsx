import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";

export default async function LicensePage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user ? { username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) } : null} />
      <div className="container mx-auto px-4 py-8 max-w-2xl">

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">フォントライセンス</h2>
          <p className="text-sm text-muted-foreground mb-4">
            本サービスでは以下のフォントを使用しています。
          </p>
          <div className="space-y-4">
            <div id="hui-font" className="bg-muted rounded-lg p-4 scroll-mt-20">
              <p className="font-medium mb-2">ふい字</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/font-samples/hui-font.avif"
                alt="ふい字の見本"
                className="w-full h-auto rounded-md border border-border mb-3 dark:invert"
              />
              <p className="text-xs text-muted-foreground mb-2">Copyright © ふい字置き場</p>
              <p className="text-sm text-muted-foreground mb-1">
                本フォントは作者による独自ライセンスのもとで配布されており、商用・非商用を問わず無料で利用できます。
              </p>
              <p className="text-sm text-muted-foreground">
                フォントファイルの販売および加工は禁止されています。
              </p>
            </div>

            <div id="noto-sans-jp" className="bg-muted rounded-lg p-4 scroll-mt-20">
              <p className="font-medium mb-2">Noto Sans JP</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/font-samples/noto-sans-jp.avif"
                alt="Noto Sans JP の見本"
                className="w-full h-auto rounded-md border border-border mb-3 dark:invert"
              />
              <p className="text-xs text-muted-foreground mb-2">Copyright © Google LLC</p>
              <p className="text-sm text-muted-foreground mb-2">
                本フォントは SIL Open Font License, Version 1.1 のもとで配布されています。
              </p>
              <a
                href="https://scripts.sil.org/OFL"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                https://scripts.sil.org/OFL
              </a>
            </div>

            <div id="light-novel-pop" className="bg-muted rounded-lg p-4 scroll-mt-20">
              <p className="font-medium mb-2">ラノベPOP V2</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/font-samples/light-novel-pop.avif"
                alt="ラノベPOP V2 の見本"
                className="w-full h-auto rounded-md border border-border mb-3 dark:invert"
              />
              <p className="text-xs text-muted-foreground mb-1">Copyright © 2019 フロップデザイン</p>
              <p className="text-xs text-muted-foreground mb-2">Derived from M+ FONTS: Copyright © 2019 M+ FONTS PROJECT</p>
              <p className="text-sm text-muted-foreground mb-2">
                本フォントは M+ FONTS License のもとで配布されています。
              </p>
              <a
                href="https://booth.pm/ja/items/2328262"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                https://booth.pm/ja/items/2328262
              </a>
            </div>

            <div id="noto-emoji" className="bg-muted rounded-lg p-4 scroll-mt-20">
              <p className="font-medium mb-2">Noto Emoji</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/font-samples/noto-emoji.avif"
                alt="Noto Emoji の見本"
                className="w-full h-auto rounded-md border border-border mb-3 dark:invert"
              />
              <p className="text-xs text-muted-foreground mb-2">Copyright © Google LLC</p>
              <p className="text-sm text-muted-foreground mb-2">
                本フォントは SIL Open Font License, Version 1.1 のもとで配布されています。
              </p>
              <a
                href="https://scripts.sil.org/OFL"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                https://scripts.sil.org/OFL
              </a>
              <p className="text-xs text-muted-foreground mt-2">
                本サービスでは、文字に絵文字を入れると全てこのフォントで表示されます。
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-6">
            フォント見本の文章には、宮沢賢治『ポラーノの広場』からの引用を含みます。
          </p>
        </section>

        <Footer />
      </div>
    </>
  );
}
