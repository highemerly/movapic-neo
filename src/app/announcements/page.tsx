import Link from "next/link";
import { Info, AlertTriangle, ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { announcements } from "@/data/announcements";

function formatDate(createdAt: string): string {
  const [y, m, d] = createdAt.split("-");
  return `${y}/${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

export default async function AnnouncementsPage() {
  const user = await getCurrentUser();
  const sorted = [...announcements].sort((a, b) => b.id - a.id);

  return (
    <>
      <SiteHeader user={user ? { username: user.username, instanceDomain: user.instance.domain } : null} />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-lg font-semibold mb-6">お知らせ</h1>

        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            お知らせはまだありません。
          </p>
        ) : (
          <ul className="divide-y border-t border-b">
            {sorted.map((announcement) => {
              const href =
                announcement.link ??
                (announcement.detail
                  ? `/announcements/${announcement.id}`
                  : null);

              const body = (
                <div className="flex items-center gap-2 py-3">
                  {announcement.type === "warning" ? (
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-red-600" />
                  ) : (
                    <Info className="h-3.5 w-3.5 flex-shrink-0 text-blue-600" />
                  )}
                  <time
                    dateTime={announcement.createdAt}
                    className="text-xs text-muted-foreground flex-shrink-0 tabular-nums"
                  >
                    {formatDate(announcement.createdAt)}
                  </time>
                  <span className="text-sm flex-1">{announcement.message}</span>
                  {href && (
                    <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  )}
                </div>
              );

              return (
                <li key={announcement.id}>
                  {href ? (
                    <Link
                      href={href}
                      className="block hover:bg-muted/50 transition-colors"
                    >
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <Footer />
      </div>
    </>
  );
}
