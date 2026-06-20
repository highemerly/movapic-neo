import Link from "@/components/Link";
import { ImagePlus } from "lucide-react";

/**
 * 右下に固定表示するフローティング投稿ボタン（FAB）。投稿ページ（/create）への導線。
 *
 * スマホでは従来どおり画面の右下（≒コンテンツ右下）に出る。PC など横幅が広い端末では
 * ブラウザの右端ではなく「コンテンツが入っている box の右下」に揃えたいので、
 * ページのコンテンツ幅（max-w-*）と同じ中央寄せコンテナの右端に配置する。
 *
 * @param maxWidthClass 配置を揃える対象ページのコンテンツ幅（例: "max-w-4xl"）。
 *   ページの container と同じ値を渡すと、その box の右端に揃う。
 */
export function FloatingPostButton({
  maxWidthClass = "max-w-6xl",
}: {
  maxWidthClass?: string;
}) {
  return (
    // 全幅の透明レイヤー。コンテンツのクリックを邪魔しないよう pointer-events-none。
    // PWA（standalone起動）時は下部メニューバーの投稿ボタンに役割を譲り、FABは隠す。
    <div className="pointer-events-none fixed inset-x-0 bottom-2 z-40 standalone:hidden">
      {/* ページ本文と同じ中央寄せコンテナ。スマホは px-6(=従来 right-6 相当)、
          PC は px-4 にしてコンテンツ box の右端に揃える。 */}
      <div
        className={`container mx-auto flex justify-end px-6 lg:px-4 ${maxWidthClass}`}
      >
        <Link
          href="/create"
          aria-label="写真を投稿"
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <ImagePlus className="h-5 w-5" />
        </Link>
      </div>
    </div>
  );
}
