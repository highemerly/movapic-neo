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
 *
 * fallback は「この投稿で実績を獲得しなかった」ときだけ描画される（PWAおすすめモーダル用）。
 * 投稿直後に出す割り込みは1つまでという排他を、ここで構造的に保証する。
 */
export function AchievementCelebration({
  username,
  fallback = null,
}: {
  username: string;
  fallback?: React.ReactNode;
}) {
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

  // hydration 前は sessionStorage を読めておらず実績の有無が確定しないため、どちらも出さない
  if (!hydrated) return null;
  if (items.length === 0) return <>{fallback}</>;
  if (dismissed) return null;

  return (
    <AchievementCelebrationModal
      items={items}
      username={username}
      onClose={() => setDismissed(true)}
    />
  );
}
