import Link from "@/components/Link";
import { ImagePlus } from "lucide-react";

/**
 * 右下に固定表示するフローティング投稿ボタン（FAB）。
 * 投稿ページ（/create）への導線。
 */
export function FloatingPostButton() {
  return (
    <Link
      href="/create"
      aria-label="写真を投稿"
      className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
    >
      <ImagePlus className="h-5 w-5" />
    </Link>
  );
}
