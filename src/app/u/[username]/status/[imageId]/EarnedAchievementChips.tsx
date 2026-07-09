"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import { AchievementIcon } from "@/components/achievements/AchievementIcon";
import type { ResolvedAchievement } from "@/lib/achievements/catalog";
import { AchievementCelebrationModal } from "./AchievementCelebrationModal";

/**
 * 画像詳細ページの「この投稿で獲得した実績」チップ。
 * クリックすると（実績ページへ遷移せず）その場で Web投稿時と同じお祝いモーダルを開く。
 * モーダル内の「実績を確認する」で従来どおり実績ページへ遷移できる。
 */
export function EarnedAchievementChips({
  achievements,
  username,
}: {
  achievements: ResolvedAchievement[];
  username: string;
}) {
  // クリックされた実績のみをモーダル表示する（Web投稿直後のまとめ表示とは異なり1件だけ）。
  const [selected, setSelected] = useState<ResolvedAchievement | null>(null);

  if (achievements.length === 0) return null;

  return (
    <>
      <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-amber-700 dark:text-amber-400">
        <Trophy
          className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-600"
          aria-label="この投稿で獲得した実績"
        />
        {achievements.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => setSelected(a)}
            className="inline-flex items-center gap-1 hover:underline"
          >
            <AchievementIcon name={a.icon} className="h-3.5 w-3.5" />
            {a.title}
          </button>
        ))}
      </p>
      {selected && (
        <AchievementCelebrationModal
          items={[selected]}
          username={username}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
