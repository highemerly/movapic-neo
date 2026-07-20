import Link from "@/components/Link";
import { Images, Calendar, Map as MapIcon, Trophy } from "lucide-react";
import type { ReactNode } from "react";

export interface ProfileStatCardsData {
  imageCount: number;
  streak: number;
  prefectureCount: number;
  goldCount: number;
  silverCount: number;
}

interface ProfileStatCardsProps {
  seg: string;
  stats: ProfileStatCardsData;
  // 地図非公開ユーザーは地図カードを非アクティブ表示にする（都道府県数も出さない）。
  showMap: boolean;
  // 主要動線（ダッシュボード）ではプリフェッチを明示オプトイン。
  prefetch?: boolean;
}

// 指標ごとの配色（カード地・チップ・数値）。ライトは淡色地×濃字、ダークは半透明地×明字で
// 両テーマとも読めるコントラストにする。実績カードも他と同じ chip＋数値行の構造に揃える。
const COLORS = {
  blue: {
    card: "bg-blue-50 border-blue-200 hover:border-blue-300 dark:bg-blue-500/10 dark:border-blue-500/20 dark:hover:border-blue-500/40",
    chip: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300",
    num: "text-blue-700 dark:text-blue-200",
  },
  orange: {
    card: "bg-orange-50 border-orange-200 hover:border-orange-300 dark:bg-orange-500/10 dark:border-orange-500/20 dark:hover:border-orange-500/40",
    chip: "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300",
    num: "text-orange-700 dark:text-orange-200",
  },
  emerald: {
    card: "bg-emerald-50 border-emerald-200 hover:border-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:hover:border-emerald-500/40",
    chip: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300",
    num: "text-emerald-700 dark:text-emerald-200",
  },
  amber: {
    card: "bg-amber-50 border-amber-200 hover:border-amber-300 dark:bg-amber-500/10 dark:border-amber-500/20 dark:hover:border-amber-500/40",
    chip: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300",
    num: "text-amber-700 dark:text-amber-200",
  },
} as const;

const CARD_BASE =
  "group flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 text-center transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm";
const CHIP_BASE =
  "flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-150 group-hover:scale-110";
const NUM_CLASS = "text-lg font-bold tabular-nums leading-none";
const UNIT_CLASS = "text-[10px] text-muted-foreground";

// 統計1枚（アイコンチップ＋数値行）。数値行は前後に任意のラベル（例: 連続◯日）を付けられる。
function StatCard({
  href,
  prefetch,
  ariaLabel,
  title,
  color,
  icon,
  children,
}: {
  href: string;
  prefetch: boolean;
  ariaLabel: string;
  title: string;
  color: (typeof COLORS)[keyof typeof COLORS];
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={`${CARD_BASE} ${color.card}`}
      aria-label={ariaLabel}
      title={title}
    >
      <span className={`${CHIP_BASE} ${color.chip}`}>{icon}</span>
      <span className="whitespace-nowrap leading-none">{children}</span>
    </Link>
  );
}

/**
 * ユーザー概要／ダッシュボードの「あなたの情報」で共通の4指標カード
 * （投稿数・連続投稿日数・都道府県数・獲得実績）。表示内容は両画面で完全一致させる。
 */
export function ProfileStatCards({ seg, stats, showMap, prefetch = false }: ProfileStatCardsProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      <StatCard
        href={`/u/${seg}/photos`}
        prefetch={prefetch}
        ariaLabel="一覧"
        title="投稿数"
        color={COLORS.blue}
        icon={<Images className="h-[18px] w-[18px]" />}
      >
        <span className={`${NUM_CLASS} ${COLORS.blue.num}`}>{stats.imageCount}</span>
        <span className={UNIT_CLASS}>枚</span>
      </StatCard>

      <StatCard
        href={`/u/${seg}/calendar`}
        prefetch={prefetch}
        ariaLabel="カレンダー"
        title="連続投稿日数"
        color={COLORS.orange}
        icon={<Calendar className="h-[18px] w-[18px]" />}
      >
        <span className={UNIT_CLASS}>連続</span>
        <span className={`${NUM_CLASS} ${COLORS.orange.num}`}>{stats.streak}</span>
        <span className={UNIT_CLASS}>日</span>
      </StatCard>

      {showMap ? (
        <StatCard
          href={`/u/${seg}/map`}
          prefetch={prefetch}
          ariaLabel="地図"
          title="都道府県数"
          color={COLORS.emerald}
          icon={<MapIcon className="h-[18px] w-[18px]" />}
        >
          <span className={`${NUM_CLASS} ${COLORS.emerald.num}`}>{stats.prefectureCount}</span>
          <span className={UNIT_CLASS}>カ所</span>
        </StatCard>
      ) : (
        <div
          className={`${CARD_BASE} cursor-not-allowed bg-muted/30 opacity-60`}
          aria-label="地図（非公開）"
          title="地図は非公開です"
        >
          <span className={`${CHIP_BASE} bg-muted text-muted-foreground`}>
            <MapIcon className="h-[18px] w-[18px]" />
          </span>
          <span className={UNIT_CLASS}>地図</span>
        </div>
      )}

      {/* 実績は金/銀の2値。他カードと同じ chip＋数値行に揃え、数値行に金・銀を横並びで置く。 */}
      <Link
        href={`/u/${seg}/achievements`}
        prefetch={prefetch}
        className={`${CARD_BASE} ${COLORS.amber.card}`}
        aria-label="実績"
        title="獲得実績（金・銀）"
      >
        <span className={`${CHIP_BASE} ${COLORS.amber.chip}`}>
          <Trophy className="h-[18px] w-[18px]" />
        </span>
        <span className="flex items-center gap-2 leading-none whitespace-nowrap">
          <span className="flex items-center gap-0.5">
            <Trophy className="h-3 w-3 fill-amber-400 text-amber-600" />
            <span className="text-sm font-bold tabular-nums">{stats.goldCount}</span>
          </span>
          <span className="flex items-center gap-0.5">
            <Trophy className="h-3 w-3 fill-slate-300 text-slate-500" />
            <span className="text-sm font-bold tabular-nums">{stats.silverCount}</span>
          </span>
        </span>
      </Link>
    </div>
  );
}
