import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/Link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";
import { releaseNotes } from "@/data/releaseNotes";
import { renderInlineLinks } from "@/lib/markdownLinks";

function formatDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${y}/${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

// カテゴリごとの見出しラベルとバッジ色（Add=緑 / Fix=橙 / Change=青）。
const CATEGORIES = [
  { key: "add", label: "Add", badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  { key: "fix", label: "Fix", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  { key: "change", label: "Change", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
] as const;

export function generateStaticParams() {
  return releaseNotes.map((note) => ({ version: note.version }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ version: string }>;
}): Promise<Metadata> {
  const { version } = await params;
  const note = releaseNotes.find((n) => n.version === version);
  if (!note) return { title: "リリースノート" };
  return {
    title: `リリースノート v${note.version}`,
    description: note.title ?? `SHAMEZO v${note.version} の更新内容`,
  };
}

export default async function ReleaseNoteDetailPage({
  params,
}: {
  params: Promise<{ version: string }>;
}) {
  const { version } = await params;
  const note = releaseNotes.find((n) => n.version === version);

  if (!note) {
    notFound();
  }

  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user ? { username: user.username, instanceDomain: user.instance.domain, avatarUrl: getAvatarUrl(user.avatarUrl) } : null} />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Link
          href="/spec/release-note"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          リリースノート一覧へ
        </Link>

        <article>
          <header className="mb-6">
            <div className="flex items-baseline gap-2 mb-1">
              <h1 className="text-xl font-semibold">v{note.version}</h1>
              <time dateTime={note.date} className="text-xs text-muted-foreground tabular-nums">
                {formatDate(note.date)}
              </time>
            </div>
            {note.title && (
              <p className="text-sm text-muted-foreground">{note.title}</p>
            )}
          </header>

          <div className="space-y-5">
            {CATEGORIES.map((cat) => {
              const items = note[cat.key];
              if (!items || items.length === 0) return null;
              return (
                <section key={cat.key}>
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-semibold mb-2 ${cat.badge}`}
                  >
                    {cat.label}
                  </span>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {items.map((item, i) => (
                      <li key={i}>{renderInlineLinks(item)}</li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </article>

        <Footer />
      </div>
    </>
  );
}
