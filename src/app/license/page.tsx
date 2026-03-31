import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";

export default async function LicensePage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user ? { username: user.username } : null} />
      <div className="container mx-auto px-4 py-8 max-w-2xl">

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">フォントライセンス</h2>
          <p className="text-sm text-muted-foreground mb-4">
            本サービスでは以下のフォントを使用しています。
          </p>
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-1">Noto Sans JP</p>
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

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-1">ふい字</p>
              <p className="text-xs text-muted-foreground mb-2">Copyright © ふい字置き場</p>
              <p className="text-sm text-muted-foreground mb-1">
                本フォントは作者による独自ライセンスのもとで配布されており、商用・非商用を問わず無料で利用できます。
              </p>
              <p className="text-sm text-muted-foreground">
                フォントファイルの販売および加工は禁止されています。
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-medium mb-1">ラノベPOP V2</p>
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
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
