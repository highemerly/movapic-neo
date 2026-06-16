import type { SVGProps } from "react";

/**
 * 「複数枚」を示すアイコン: 塗りつぶした□（手前＝左下）に、輪郭だけの□（奥＝右上）が重なる形。
 * lucide の Copy 風だが、手前を塗りつぶし、重なりを左下寄せにしてある（カレンダーの枚数バッジ用）。
 * currentColor で塗り・線ともに描くので、className で text-色 と drop-shadow を当てて使う。
 */
export function StackedSquaresIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* 奥の□（右上・輪郭のみ） */}
      <rect x="8" y="3" width="13" height="13" rx="2" />
      {/* 手前の□（左下・塗りつぶし） */}
      <rect x="3" y="8" width="13" height="13" rx="2" fill="currentColor" />
    </svg>
  );
}
