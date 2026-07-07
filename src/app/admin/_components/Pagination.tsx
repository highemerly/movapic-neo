import Link from "@/components/Link";
import { withParams } from "./query";

/** 表示するページ番号の窓（現在ページ±この数） */
const WINDOW = 2;

/** 前/次＋ページ番号のページネーション（searchParams 駆動）。1ページのみなら描画しない。 */
export function Pagination({
  basePath,
  params,
  page,
  totalPages,
  totalCount,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  totalPages: number;
  totalCount?: number;
}) {
  if (totalPages <= 1) {
    return typeof totalCount === "number" ? (
      <p className="mt-3 text-center text-xs text-muted-foreground tabular-nums">
        全 {totalCount.toLocaleString("ja-JP")} 件
      </p>
    ) : null;
  }

  const nums: number[] = [];
  const from = Math.max(1, page - WINDOW);
  const to = Math.min(totalPages, page + WINDOW);
  for (let i = from; i <= to; i++) nums.push(i);

  const cell =
    "min-w-9 rounded-md border border-border px-2.5 py-1.5 text-center text-sm tabular-nums";
  const linkTo = (p: number) => withParams(basePath, params, { page: p === 1 ? undefined : p });

  return (
    <nav className="mt-4 flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {page > 1 ? (
          <Link href={linkTo(page - 1)} scroll={false} className={`${cell} hover:bg-muted`}>
            ‹ 前
          </Link>
        ) : (
          <span className={`${cell} text-muted-foreground opacity-40`}>‹ 前</span>
        )}

        {from > 1 && (
          <>
            <Link href={linkTo(1)} scroll={false} className={`${cell} hover:bg-muted`}>
              1
            </Link>
            {from > 2 && <span className="px-1 text-muted-foreground">…</span>}
          </>
        )}

        {nums.map((p) =>
          p === page ? (
            <span key={p} className={`${cell} bg-foreground font-semibold text-background`}>
              {p}
            </span>
          ) : (
            <Link key={p} href={linkTo(p)} scroll={false} className={`${cell} hover:bg-muted`}>
              {p}
            </Link>
          )
        )}

        {to < totalPages && (
          <>
            {to < totalPages - 1 && <span className="px-1 text-muted-foreground">…</span>}
            <Link href={linkTo(totalPages)} scroll={false} className={`${cell} hover:bg-muted`}>
              {totalPages}
            </Link>
          </>
        )}

        {page < totalPages ? (
          <Link href={linkTo(page + 1)} scroll={false} className={`${cell} hover:bg-muted`}>
            次 ›
          </Link>
        ) : (
          <span className={`${cell} text-muted-foreground opacity-40`}>次 ›</span>
        )}
      </div>
      {typeof totalCount === "number" && (
        <p className="text-xs text-muted-foreground tabular-nums">
          全 {totalCount.toLocaleString("ja-JP")} 件 ・ {page} / {totalPages} ページ
        </p>
      )}
    </nav>
  );
}
