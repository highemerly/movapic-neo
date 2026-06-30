import type { Metadata } from "next";
import Link from "@/components/Link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";
import { sortedReleaseNotes } from "@/data/releaseNotes";

export const metadata: Metadata = {
  title: "リリースノート",
  description: "SHAMEZOの更新履歴",
};

function formatDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${y}/${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

export default async function ReleaseNoteListPage() {
  const user = await getCurrentUser();
  const notes = sortedReleaseNotes();

  return (
    <>
      <SiteHeader user={user ? { username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) } : null} />
      <div className="container mx-auto px-4 py-3 max-w-2xl">
        <div className="mb-2">
          <Link
            href="/spec"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            技術仕様へ
          </Link>
        </div>

        <h1 className="text-lg font-semibold mb-6">リリースノート</h1>

        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            リリースノートはまだありません。
          </p>
        ) : (
          <ul className="divide-y border-t border-b">
            {notes.map((note) => (
              <li key={note.version}>
                <Link
                  href={`/spec/release-note/${note.version}`}
                  className="flex items-center gap-3 py-3 hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm font-medium tabular-nums flex-shrink-0">
                    v{note.version}
                  </span>
                  <time
                    dateTime={note.date}
                    className="text-xs text-muted-foreground flex-shrink-0 tabular-nums"
                  >
                    {formatDate(note.date)}
                  </time>
                  <span className="text-sm flex-1 text-muted-foreground">
                    {note.title ?? ""}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Footer />
      </div>
    </>
  );
}
