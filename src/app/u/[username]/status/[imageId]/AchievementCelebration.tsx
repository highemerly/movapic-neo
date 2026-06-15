"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { AchievementIcon } from "@/components/achievements/AchievementIcon";
import { resolveAchievement } from "@/lib/achievements/catalog";
import { useIsHydrated } from "@/hooks/useIsHydrated";

const STORAGE_KEY = "movapic_new_achievements";

type Raw = { key: string; category: string };

// 装飾用のキラキラ配置（決め打ち）
const SPARKLES = [
  { top: "8%", left: "12%", size: 18, delay: "0s" },
  { top: "16%", left: "82%", size: 14, delay: "0.2s" },
  { top: "70%", left: "8%", size: 16, delay: "0.4s" },
  { top: "78%", left: "86%", size: 20, delay: "0.1s" },
  { top: "40%", left: "4%", size: 12, delay: "0.5s" },
  { top: "44%", left: "92%", size: 12, delay: "0.3s" },
];

export function AchievementCelebration({ username }: { username: string }) {
  const hydrated = useIsHydrated();
  const [dismissed, setDismissed] = useState(false);

  // hydration 後に sessionStorage を読む（読むだけ・冪等。削除は effect 側で行う）。
  const items = useMemo(() => {
    if (!hydrated) return [];
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Raw[];
      if (!Array.isArray(parsed) || parsed.length === 0) return [];
      return parsed.map((p) => resolveAchievement(p.key, p.category));
    } catch {
      return [];
    }
  }, [hydrated]);

  // 一度演出したら消費する（外部システムへの書き込み = effect で行ってよい）。
  useEffect(() => {
    if (items.length > 0) {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // 無視
      }
    }
  }, [items]);

  const visible = !dismissed && items.length > 0;
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={() => setDismissed(true)}
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
            <Link
              key={a.key}
              href={`/u/${username}/achievements?a=${encodeURIComponent(a.key)}`}
              className="flex items-center gap-3 rounded-xl border border-amber-200/70 bg-white/70 p-3 text-left transition-colors hover:bg-amber-100/70 dark:border-amber-800/50 dark:bg-white/5 dark:hover:bg-amber-900/30"
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
            </Link>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="mt-6 w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-600"
        >
          やったね！
        </button>
      </div>
    </div>
  );
}
