"use client";

import Link from "@/components/Link";
import { Sparkles } from "lucide-react";
import { AchievementIcon } from "@/components/achievements/AchievementIcon";
import type { ResolvedAchievement } from "@/lib/achievements/catalog";

// 装飾用のキラキラ配置（決め打ち）
const SPARKLES = [
  { top: "8%", left: "12%", size: 18, delay: "0s" },
  { top: "16%", left: "82%", size: 14, delay: "0.2s" },
  { top: "70%", left: "8%", size: 16, delay: "0.4s" },
  { top: "78%", left: "86%", size: 20, delay: "0.1s" },
  { top: "40%", left: "4%", size: 12, delay: "0.5s" },
  { top: "44%", left: "92%", size: 12, delay: "0.3s" },
];

/**
 * 実績獲得のお祝いモーダル（表示専用）。
 * Web投稿直後の自動表示（[AchievementCelebration]）と、画像詳細ページの実績チップ
 * クリック時（[EarnedAchievementChips]）の両方から使う共通UI。
 * 「実績を確認する」→実績ページへ遷移（従来挙動）／「とじる」→onClose で閉じる。
 */
export function AchievementCelebrationModal({
  items,
  username,
  onClose,
}: {
  items: ResolvedAchievement[];
  username: string;
  onClose: () => void;
}) {
  if (items.length === 0) return null;

  // 1件なら該当実績の詳細モーダルを開く。複数なら実績ページのトップへ。
  const achievementsHref =
    items.length === 1
      ? `/u/${username}/achievements?a=${encodeURIComponent(items[0].key)}`
      : `/u/${username}/achievements`;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label="実績を獲得しました"
    >
      <div
        className="animate-celebrate-in relative w-full max-w-sm overflow-hidden rounded-2xl border border-amber-300/60 bg-gradient-to-b from-amber-50 to-white p-6 text-center shadow-2xl dark:border-amber-700/50 dark:from-amber-950/60 dark:to-background"
        onClick={(e) => e.stopPropagation()}
      >
        {/* キラキラ */}
        {SPARKLES.map((s, i) => (
          <Sparkles
            key={i}
            className="animate-sparkle pointer-events-none absolute text-amber-400"
            style={{ top: s.top, left: s.left, width: s.size, height: s.size, animationDelay: s.delay }}
          />
        ))}

        <p className="text-xs font-bold tracking-widest text-amber-600 dark:text-amber-400">
          ACHIEVEMENT
        </p>
        <p className="mt-1 text-base font-bold">
          実績を{items.length > 1 ? `${items.length}件` : ""}獲得しました！
        </p>

        <div className="mt-5 space-y-3">
          {items.map((a) => (
            <div
              key={a.key}
              className="flex items-center gap-3 rounded-xl border border-amber-200/70 bg-white/70 p-3 text-left dark:border-amber-800/50 dark:bg-white/5"
            >
              <span className="animate-trophy-pop flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-800 shadow-inner dark:bg-amber-900 dark:text-amber-200">
                <AchievementIcon name={a.icon} className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">🏆 {a.title}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {a.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href={achievementsHref}
            className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-600"
          >
            実績を確認する
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-amber-300/60 px-4 py-2.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100/60 dark:border-amber-700/50 dark:text-amber-300 dark:hover:bg-amber-900/30"
          >
            とじる
          </button>
        </div>
      </div>
    </div>
  );
}
