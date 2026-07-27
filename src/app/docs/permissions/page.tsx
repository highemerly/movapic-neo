/**
 * トークンに必要な権限（/docs/permissions）: ログイン時に Fediverse サーバーへ要求する
 * 権限スコープの公開ページ。
 *
 * ログイン前の判断材料になるプライバシー寄りの情報なので、技術仕様の一節ではなく
 * 単独ページとしてドキュメントセンターから直接たどれるようにする。
 * 本体はログイン画面の説明モーダルと共有する PermissionTabs。
 */

import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";
import { BackLink } from "@/components/BackLink";
import { PageContainer } from "@/components/PageContainer";
import { PermissionTabs } from "@/components/auth/PermissionTabs";

export const metadata: Metadata = {
  title: "トークンに必要な権限",
  description:
    "SHAMEZOがログイン時にFediverseサーバーへ要求する権限スコープと、その用途",
};

export default async function DocsPermissionsPage() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user ? { username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) } : null} />
      <PageContainer>
        <BackLink href="/docs">ドキュメントセンターへ</BackLink>

        <h1 className="text-lg font-semibold mb-4">トークンに必要な権限</h1>

        <p className="text-sm text-muted-foreground mb-6">
          ログイン時、連携する Fediverse サーバーに対し、以下の権限スコープを要求します。投稿・画像アップロード・リアクションなど、必要な最小限の範囲に限っています。
        </p>

        <PermissionTabs />

        <Footer />
      </PageContainer>
    </>
  );
}
