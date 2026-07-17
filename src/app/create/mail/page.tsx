import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getAvatarUrl } from "@/lib/avatar";
import { getEmailDomain } from "@/lib/postMethods";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { EmailGuide } from "@/components/post-methods/EmailGuide";

export const metadata: Metadata = {
  title: "メールから投稿",
  description: "専用アドレスにメールを送って画像を投稿する方法",
};

export default async function CreateMailPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/?reason=login_required&returnTo=%2Fcreate%2Fmail");
  }

  // メール投稿が未提供（env 未設定）の環境ではこのページ自体を出さない
  const emailDomain = getEmailDomain();
  if (!emailDomain) notFound();

  return (
    <>
      <SiteHeader
        user={{ username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) }}
      />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <section className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">メールから投稿</h1>
          </div>

          <div className="bg-muted rounded-lg p-4">
            <EmailGuide emailPrefix={user.emailPrefix} emailDomain={emailDomain} />
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
