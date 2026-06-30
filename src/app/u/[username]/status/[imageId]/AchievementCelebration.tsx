"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveAchievement } from "@/lib/achievements/catalog";
import { useIsHydrated } from "@/hooks/useIsHydrated";
import { AchievementCelebrationModal } from "./AchievementCelebrationModal";

const STORAGE_KEY = "movapic_new_achievements";

type Raw = { key: string; category: string };

/**
 * Web投稿直後に sessionStorage の新規獲得実績を読み、お祝いモーダルを自動表示する。
 * UI本体は共通の [AchievementCelebrationModal]（画像詳細のチップクリックと共用）。
 */
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

  if (dismissed || items.length === 0) return null;

  return (
    <AchievementCelebrationModal
      items={items}
      username={username}
      onClose={() => setDismissed(true)}
    />
  );
}
