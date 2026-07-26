import Link from "@/components/Link";
import { ChevronLeft } from "lucide-react";

/**
 * ページ上部の「◯◯へ戻る」ナビゲーションリンク。
 * 各ページで個別にコピー実装されていた同一パターン（ChevronLeft + 下マージン付きコンテナ）を共通化したもの。
 * 下マージン（mb-2）を内包するため、配置側では余白を付けずにコンテンツ直前に置く。
 */
export function BackLink({
  href,
  children,
  trailing,
}: {
  href: string;
  children: React.ReactNode;
  /** 行の右端に寄せて置く要素（例: 画像詳細ページのミートボールメニュー）。 */
  trailing?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Link
        href={href}
        className="inline-flex min-w-0 items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4 shrink-0" />
        <span className="truncate">{children}</span>
      </Link>
      {trailing && <div className="ml-auto shrink-0">{trailing}</div>}
    </div>
  );
}
