"use client";

import { useRouter } from "next/navigation";
import { withParams } from "./query";
import type { PeriodOption } from "@/lib/admin/periods";

/**
 * 期間切替ピッカー（searchParams 駆動）。選択肢が多い（9種）ため、
 * セグメントボタンではなくコンパクトな native <select> にしている。
 * 切替時は page を落として1ページ目に戻す（ページングと併用するテーブルでの迷子防止）。
 * rangeText を渡すと下段に「いつから〜いつまで」を右揃えで表示する。
 */
export function PeriodSelect({
  basePath,
  params,
  param,
  current,
  options,
  rangeText,
  scroll = false,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  param: string;
  current: string;
  options: readonly PeriodOption[];
  rangeText?: string;
  scroll?: boolean;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="relative">
        <select
          value={current}
          onChange={(e) =>
            router.push(withParams(basePath, params, { [param]: e.target.value, page: undefined }), {
              scroll,
            })
          }
          aria-label="期間"
          className="cursor-pointer appearance-none rounded-md border border-border bg-background py-1 pl-2.5 pr-7 text-xs font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {rangeText && (
        <p className="text-[11px] tabular-nums text-muted-foreground">{rangeText}</p>
      )}
    </div>
  );
}
