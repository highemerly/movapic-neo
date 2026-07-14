import { notFound } from "next/navigation";
import Link from "@/components/Link";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";
import { formatAnnouncementDate } from "@/lib/announcements";
import { getAnnouncementForDetail } from "@/lib/announcements.server";
import { AnnouncementTypeIcon } from "@/components/announcements/AnnouncementTypeIcon";
import { BackLink } from "@/components/BackLink";
import { PageContainer } from "@/components/PageContainer";

// [テキスト](URL) 形式のリンクをパースして React ノードに変換する
function renderDetail(detail: string) {
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = linkPattern.exec(detail)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(detail.slice(lastIndex, match.index));
    }
    const [, label, href] = match;
    const isExternal = /^https?:\/\//.test(href);
    nodes.push(
      isExternal ? (
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:no-underline"
        >
          {label}
        </a>
      ) : (
        <Link
          key={key++}
          href={href}
          className="text-primary underline hover:no-underline"
        >
          {label}
        </Link>
      )
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < detail.length) {
    nodes.push(detail.slice(lastIndex));
  }
  return nodes;
}

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
            {renderDetail(announcement.detail)}
          </div>
        </article>

        <Footer />
      </PageContainer>
    </>
  );
}
