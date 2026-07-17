import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";
import { formatAnnouncementDate } from "@/lib/announcements";
import { getAnnouncementForDetail } from "@/lib/announcements.server";
import { AnnouncementTypeIcon } from "@/components/announcements/AnnouncementTypeIcon";
import { BackLink } from "@/components/BackLink";
import { PageContainer } from "@/components/PageContainer";
import { renderInlineLinks } from "@/lib/markdownLinks";

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const announcement = await getAnnouncementForDetail(Number(id));

  if (!announcement || !announcement.detail) {
    notFound();
  }

  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user ? { username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) } : null} />
      <PageContainer>
        <BackLink href="/announcements">お知らせ一覧へ</BackLink>

        <article>
          <header className="mb-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <AnnouncementTypeIcon
                type={announcement.type}
                className="h-3.5 w-3.5"
              />
              <time dateTime={announcement.publishAt}>
                {formatAnnouncementDate(announcement.publishAt, {
                  withYear: true,
                })}
              </time>
            </div>
            <h1 className="text-xl font-semibold">{announcement.message}</h1>
          </header>

          <div className="text-sm whitespace-pre-wrap leading-relaxed">
            {renderInlineLinks(announcement.detail)}
          </div>
        </article>

        <Footer />
      </PageContainer>
    </>
  );
}
