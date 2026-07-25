import { SmilePlus } from "lucide-react";
import { formatFavoriteCount } from "@/lib/utils";

/**
 * 一覧グリッドの右下に出すリアクション数。
 * 件数は Image.favoriteCount（連合のぶんと SHAMEZO 上のリアクションをマージ済みの合計）。
 */
export function ReactionOverlay({ count }: { count: number }) {
  if (count === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-0 right-0 p-1.5 h-8 flex items-center gap-1 text-white text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
      <SmilePlus className="h-3 w-3" />
      <span>{formatFavoriteCount(count)}</span>
    </div>
  );
}
