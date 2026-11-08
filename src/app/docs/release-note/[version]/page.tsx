import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";
import { allReleaseNotes, findReleaseNote } from "@/lib/releaseNotes";
import { BackLink } from "@/components/BackLink";
import { PageContainer } from "@/components/PageContainer";
import { ReleaseNoteBody, ReleaseNoteMeta } from "../ReleaseNoteBody";

export function generateStaticParams() {
  return allReleaseNotes().map((note) => ({ version: note.version }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ version: string }>;
}): Promise<Metadata> {
  const { version } = await params;
  const note = findReleaseNote(version);
  if (!note) return { title: "リリースノート" };
  return {
    title: `リリースノート v${note.version}`,
    description: `SHAMEZO v${note.version} の更新内容`,
  };
}

export default async function ReleaseNoteDetailPage({
  params,
}: {
  params: Promise<{ version: string }>;
}) {
  const { version } = await params;
  const note = findReleaseNote(version);

  if (!note) {
    notFound();
  }

  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user ? { username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) } : null} />
      <PageContainer>
        <BackLink href="/docs/release-note">リリースノート一覧へ</BackLink>

        <article>
          <header className="mb-6">
            <h1 className="text-xl font-semibold mb-1">v{note.version}</h1>
            <ReleaseNoteMeta note={note} />
          </header>
          <ReleaseNoteBody note={note} />
        </article>

        <Footer />
      </PageContainer>
    </>
  );
}
