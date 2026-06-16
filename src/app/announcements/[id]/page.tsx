import { notFound } from "next/navigation";
import Link from "@/components/Link";
import { Info, AlertTriangle, ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";
import { announcements } from "@/data/announcements";

function formatDate(createdAt: string): string {
  const [y, m, d] = createdAt.split("-");
  return `${y}/${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

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

export function generateStaticParams() {
  return announcements
    .filter((a) => a.detail)
    .map((a) => ({ id: String(a.id) }));
}

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const announcement = announcements.find((a) => String(a.id) === id);

  if (!announcement || !announcement.detail) {
    notFound();
  }

  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user ? { username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) } : null} />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Link
          href="/announcements"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          お知らせ一覧へ
        </Link>

        <article>
          <header className="mb-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              {announcement.type === "warning" ? (
                <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
              ) : (
                <Info className="h-3.5 w-3.5 text-blue-600" />
              )}
              <time dateTime={announcement.createdAt}>
                {formatDate(announcement.createdAt)}
              </time>
            </div>
            <h1 className="text-xl font-semibold">{announcement.message}</h1>
          </header>

          <div className="text-sm whitespace-pre-wrap leading-relaxed">
            {renderDetail(announcement.detail)}
          </div>
        </article>

        <Footer />
      </div>
    </>
  );
}
