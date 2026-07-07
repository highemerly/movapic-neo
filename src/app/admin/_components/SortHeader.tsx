import Link from "@/components/Link";
import { withParams } from "./query";

/**
 * ソート可能なテーブル見出しセル。クリックで昇順/降順をトグルする。
 * この列が非アクティブなら descValue（多い順・新しい順）から入る。
 * ソート変更時は page を落として1ページ目に戻す。
 */
export function SortHeader({
  basePath,
  params,
  current,
  label,
  ascValue,
  descValue,
  className,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  current: string;
  label: string;
  ascValue: string;
  descValue: string;
  className?: string;
}) {
  const isAsc = current === ascValue;
  const isDesc = current === descValue;
  const active = isAsc || isDesc;
  // アクティブ時はトグル、非アクティブ時は desc から入る
  const next = isDesc ? ascValue : descValue;
  const arrow = isDesc ? " ▼" : isAsc ? " ▲" : "";
  return (
    <th className={className}>
      <Link
        href={withParams(basePath, params, { sort: next, page: undefined })}
        scroll={false}
        className={`inline-flex items-center hover:text-foreground ${
          active ? "text-foreground" : ""
        }`}
      >
        {label}
        <span className="tabular-nums">{arrow}</span>
      </Link>
    </th>
  );
}
