import Link from "@/components/Link";
import { withParams } from "./query";

export interface PeriodOption {
  value: string;
  label: string;
}

/**
 * 期間などのセグメント切替（searchParams 駆動）。
 * 切替時は page を落として1ページ目に戻す（ページングと併用するテーブルでの迷子防止）。
 */
export function PeriodToggle({
  basePath,
  params,
  param,
  current,
  options,
  scroll = false,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  param: string;
  current: string;
  options: PeriodOption[];
  scroll?: boolean;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
      {options.map((o) => (
        <Link
          key={o.value}
          href={withParams(basePath, params, { [param]: o.value, page: undefined })}
          scroll={scroll}
          className={
            current === o.value
              ? "bg-foreground px-2.5 py-1 font-semibold text-background"
              : "px-2.5 py-1 text-muted-foreground hover:bg-muted"
          }
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
