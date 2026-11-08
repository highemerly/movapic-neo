import { ExternalLink } from "lucide-react";
import { renderInlineLinks } from "@/lib/markdownLinks";
import { formatReleasedAt, releasedAtAttr } from "@/lib/releaseNotes";
import type { ReleaseNote } from "@/lib/releaseNotes/rules";

// カテゴリごとの見出しラベルとバッジ色（Add=緑 / Fix=橙 / Change=青）。
const CATEGORIES = [
  { key: "add", label: "Add", badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  { key: "fix", label: "Fix", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  { key: "change", label: "Change", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
] as const;

/** リリースした日時と、GitHub Release（ある版だけ）へのリンク */
export function ReleaseNoteMeta({ note }: { note: ReleaseNote }) {
  return (
    <span className="flex items-baseline gap-3 text-xs text-muted-foreground tabular-nums">
      <time dateTime={releasedAtAttr(note)}>{formatReleasedAt(note)}</time>
      {note.url && (
        <a
          href={note.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
        >
          すべての変更を見る
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </span>
  );
}

export function ReleaseNoteBody({ note }: { note: ReleaseNote }) {
  return (
    <div className="space-y-4">
      {CATEGORIES.map((cat) => {
        const items = note[cat.key];
        if (!items || items.length === 0) return null;
        return (
          <section key={cat.key}>
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold mb-2 ${cat.badge}`}>
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
  );
}
