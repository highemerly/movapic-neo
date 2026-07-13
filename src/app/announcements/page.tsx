import Link from "@/components/Link";
import { ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";
import { formatAnnouncementDate } from "@/lib/announcements";
import { getListedAnnouncements } from "@/lib/announcements.server";
import { AnnouncementTypeIcon } from "@/components/announcements/AnnouncementTypeIcon";

export default async function AnnouncementsPage() {
  const user = await getCurrentUser();
  const sorted = await getListedAnnouncements();

  return (
    <>
      <SiteHeader user={user ? { username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) } : null} />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-lg font-semibold mb-6">お知らせ</h1>

        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            お知らせはまだありません。
          </p>
        ) : (
          <ul className="divide-y border-t border-b">
            {sorted.map((announcement) => {
              const href = announcement.detail
                ? `/announcements/${announcement.id}`
                : null;

              const body = (
                <div className="flex items-center gap-2 py-3">
                  <AnnouncementTypeIcon
                    type={announcement.type}
                    className="h-3.5 w-3.5 flex-shrink-0"
                  />
                  <time
                    dateTime={announcement.publishAt}
                    className="text-xs text-muted-foreground flex-shrink-0 tabular-nums"
                  >
                    {formatAnnouncementDate(announcement.publishAt, {
                      withYear: true,
                    })}
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
