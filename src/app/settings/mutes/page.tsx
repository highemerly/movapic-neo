import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getActiveMutes, countActiveMutes } from "@/lib/mutes";
import { getAvatarUrl } from "@/lib/avatar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { BackLink } from "@/components/BackLink";
import { PageContainer } from "@/components/PageContainer";
import { Pagination } from "@/app/admin/_components/Pagination";
import { normalizeParams, parsePage } from "@/app/admin/_components/query";
import { MutesManager, type MuteEntryDto } from "./MutesManager";

export const dynamic = "force-dynamic";

/** ミュート管理の1ページ件数 */
const PAGE_SIZE = 25;

export default async function MutesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  const params = normalizeParams(await searchParams);
  const page = parsePage(params.page);

  const total = await countActiveMutes(user.id);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // 総数が減って現在ページが範囲外になっても、空表示にせず取得はクランプする。
  const safePage = Math.min(page, totalPages);

  const mutes = await getActiveMutes(user.id, {
    skip: (safePage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const dto: MuteEntryDto[] = mutes.map((m) => ({
    id: m.id,
    expiresAt: m.expiresAt?.toISOString() ?? null,
    mutedUser: {
      id: m.mutedUser.id,
      username: m.mutedUser.username,
      displayName: m.mutedUser.displayName,
      avatarUrl: getAvatarUrl(m.mutedUser.avatarUrl),
      domain: m.mutedUser.domain,
    },
  }));

  return (
    <>
      <SiteHeader user={{ username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) }} />
      <PageContainer>
        <BackLink href="/settings">設定</BackLink>

        <h1 className="text-lg font-semibold mb-2">ミュートの管理</h1>
        <p className="text-xs text-muted-foreground mb-6">
          ミュートしているユーザーは、タイムラインで投稿が非表示になります。相手には通知されません。
        </p>

        <MutesManager mutes={dto} />

        <Pagination
          basePath="/settings/mutes"
          params={params}
          page={safePage}
          totalPages={totalPages}
          totalCount={total}
        />

        <Footer />
      </PageContainer>
    </>
  );
}
