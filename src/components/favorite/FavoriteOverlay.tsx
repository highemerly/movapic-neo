import { Heart } from "lucide-react";
import { formatFavoriteCount } from "@/lib/utils";

interface FavoriteOverlayProps {
  count: number;
}

export function FavoriteOverlay({ count }: FavoriteOverlayProps) {
  if (count === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-0 right-0 p-1.5 h-8 flex items-center gap-1 text-white/90 text-xs">
      <Heart className="h-3 w-3 fill-current" />
      <span>{formatFavoriteCount(count)}</span>
    </div>
  );
}
