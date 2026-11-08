import type { Metadata } from "next";
import Link from "@/components/Link";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";
import { allReleaseNotes, groupByMinor } from "@/lib/releaseNotes";
import { BackLink } from "@/components/BackLink";
import { PageContainer } from "@/components/PageContainer";
import { ReleaseNoteBody, ReleaseNoteMeta } from "./ReleaseNoteBody";

export const metadata: Metadata = {
  title: "リリースノート",
  description: "SHAMEZOの更新履歴",
};

// v1.4.1 からはパッチも含め版ごとに出すので、1つずつ開かなくても読めるよう中身ごと並べ、
// マイナーの版ごとに見出しを付ける。版ごとのページ（/docs/release-note/[version]）はリンク用に残す。
export default async function ReleaseNoteListPage() {
  const user = await getCurrentUser();
  const groups = groupByMinor(allReleaseNotes());

  return (
    <>
      <SiteHeader user={user ? { username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) } : null} />
      <PageContainer>
        <BackLink href="/docs">ドキュメントセンターへ</BackLink>

        <h1 className="text-lg font-semibold mb-6">リリースノート</h1>

        <div className="space-y-10">
          {groups.map((group) => (
            <section key={group.minor}>
              <h2 className="text-base font-semibold border-b pb-2 mb-4">v{group.minor}</h2>
              <div className="space-y-8">
                {group.notes.map((note) => (
                  <article key={note.version} id={`v${note.version}`}>
                    <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
                      <h3 className="text-sm font-semibold tabular-nums">
                        <Link href={`/docs/release-note/${note.version}`} className="hover:underline underline-offset-2">
                          v{note.version}
                        </Link>
                      </h3>
                      <ReleaseNoteMeta note={note} />
                    </header>
                    <ReleaseNoteBody note={note} />
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <Footer />
      </PageContainer>
    </>
  );
}
