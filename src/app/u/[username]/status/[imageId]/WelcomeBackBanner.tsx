import { Sparkles } from "lucide-react";
import {
  welcomeBackNotificationDetail,
  welcomeBackNotificationText,
  type WelcomeBackNotificationData,
} from "@/lib/notifications/welcomeBackNotificationType";

/**
 * しばらく空いた後に投稿した本人へ、投稿直後に出す「おかえり」バナー。
 * モーダルにしないのは、投稿直後の割り込み（実績のお祝い・PWA のおすすめ）は1つまでという排他
 * （AchievementCelebration の fallback）と競合させないため。復帰した投稿は実績も取りやすく、
 * 両方モーダルだとどちらかが消える。
 */
export function WelcomeBackBanner({ data }: { data: WelcomeBackNotificationData | null }) {
  return (
    <div className="animate-celebrate-in relative mb-3 overflow-hidden rounded-xl bg-gradient-to-r from-sky-100 via-rose-50 to-sky-100 px-4 py-3 shadow-sm dark:from-sky-950/60 dark:via-rose-950/40 dark:to-sky-950/60">
      {/* 斜めの光沢が左から右へ走る（皆勤賞バナーと同じ演出） */}
      <div className="animate-banner-shine pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-white/50 blur-md dark:bg-white/10" />
      <div className="relative flex items-center gap-2.5">
        <Sparkles className="animate-trophy-pop h-6 w-6 shrink-0 text-sky-600 dark:text-sky-300" />
        <div className="min-w-0">
          <p className="text-sm font-bold sm:text-base">{welcomeBackNotificationText(data)}</p>
          <p className="text-xs text-muted-foreground">{welcomeBackNotificationDetail()}</p>
        </div>
      </div>
    </div>
  );
}
