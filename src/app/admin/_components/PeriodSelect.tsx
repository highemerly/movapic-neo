"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "./NativeSelect";
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
      <NativeSelect
        value={current}
        onChange={(e) =>
          router.push(withParams(basePath, params, { [param]: e.target.value, page: undefined }), {
            scroll,
          })
        }
        aria-label="期間"
        className="py-1 text-xs"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
      {rangeText && (
        <p className="text-[11px] tabular-nums text-muted-foreground">{rangeText}</p>
      )}
    </div>
  );
}
