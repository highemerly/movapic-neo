import { Footprints, Crown, CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { AchievementIcon } from "./AchievementIcon";
import { SectionTitle } from "./SectionTitle";
import { ladderNextGoals, type NextGoal } from "@/lib/achievements/nextGoals";
import { coveredDays } from "@/lib/achievements/perfectMonth";
import { daysLeftToPost, monthDaysGoal } from "@/lib/achievements/monthDays";
import type { CurrentMonthPerfect } from "@/lib/achievements/stats";

const MAX_LADDER_GOALS = 2; // 皆勤カード1枚 + ラダー2枚

/** 進捗バー（0〜1）。 */
function Bar({ ratio, className }: { ratio: number; className?: string }) {
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600", className)}
        style={{ width: `${Math.min(100, Math.max(4, ratio * 100))}%` }}
      />
    </div>
  );
}

function GoalCard({
  icon,
  title,
  pinned,
  remain,
  remainMuted,
  ratio,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  pinned?: boolean;
  remain: string;
  /** remain を注意色（ピンク）でなく控えめに出す（達成済み・達成不可時）。 */
  remainMuted?: boolean;
  ratio: number;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
        pinned
          ? "border-amber-300/70 bg-gradient-to-br from-amber-50 to-muted/30 hover:from-amber-100 dark:border-amber-800/60 dark:from-amber-950/40"
          : "border-border bg-muted/40 hover:bg-muted/70"
      )}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-amber-300/70 bg-amber-100 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/50 dark:text-amber-200">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-bold">{title}</span>
          <span
            className={cn(
              "shrink-0 whitespace-nowrap text-[11.5px] font-extrabold",
              remainMuted ? "text-muted-foreground" : "text-brand"
            )}
          >
            {remain}
          </span>
        </span>
        <Bar ratio={ratio} />
        <span className="mt-1.5 block text-[11px] tabular-nums text-muted-foreground">{sub}</span>
      </span>
    </button>
  );
}

/**
 * 穴を埋めるための次の一手（ポイント制の月は残ポイントを添える）。
 * 残ポイントは本人にだけ出す（カレンダーAPIも makeup 枠を owner にしか返さない＝出し分けを揃える）。
 */
function makeupHint(p: CurrentMonthPerfect, isOwner: boolean): string {
  if (!isOwner) return "2枚投稿で穴埋めしよう";
  if (p.status.remaining === 0) return "ポイントが付与されると穴埋めできます";
  return `残り${p.status.remaining}pt ・ 2枚投稿で穴埋めしよう`;
}

interface CardProps {
  remain: string;
  remainMuted: boolean;
  ratio: number;
  sub: string;
}

/**
 * 皆勤賞が不可能になった月のカード（月間投稿日数の次の目標）。
 * 以前は「今月は達成条件を達成できません」とだけ出していて、外した瞬間にその月の目標が消えていた。
 * 日数は実際に投稿した日数（穴埋めは数えない＝月間投稿日数の実績と同じ数え方）。
 */
function monthDaysCardProps(p: CurrentMonthPerfect): CardProps {
  const posted = p.distinctDays;
  const goal = monthDaysGoal({
    postedDays: posted,
    daysLeft: daysLeftToPost({
      daysInMonth: p.daysInMonth,
      todayDayNum: p.todayDayNum,
      postedToday: p.status.todayPosts >= 1,
    }),
  });
  if (goal.kind === "next") {
    return {
      remain: `あと${goal.remaining}日`,
      remainMuted: false,
      ratio: posted / goal.tier,
      sub: `${posted} / ${goal.tier}日投稿 ・ ${goal.tier}日投稿で実績獲得！`,
    };
  }
  if (goal.kind === "reached") {
    return {
      remain: `${goal.tier}日 達成 🎉`,
      remainMuted: true,
      ratio: 1,
      sub: `今月は${posted}日投稿 ・ 皆勤賞は来月トライしよう！`,
    };
  }
  return {
    remain: "来月トライしよう！",
    remainMuted: true,
    ratio: posted / p.daysInMonth,
    sub: `今月は${posted}日投稿`,
  };
}

/**
 * 当月皆勤カードの表示内容を状況から決める（皆勤賞にまだ手が届く月だけ。不可能な月は monthDaysCardProps）。
 * 日数はすべて covered（投稿日＋穴埋め済みの日）基準で出す。穴埋めした日はカレンダー上も
 * 埋まって見えるため、実投稿日数で出すと「毎日埋めているのに 29/31」と食い違う。
 */
function perfectCardProps(p: CurrentMonthPerfect, isOwner: boolean): CardProps {
  const covered = coveredDays(p.distinctDays, p.status);
  const ratio = p.daysInMonth > 0 ? covered / p.daysInMonth : 0;
  // 残りは「まだ押さえていない日数」＝ 今日を含む未投稿日（月末までの日数ではない）。
  const daysLeft = Math.max(0, p.daysInMonth - covered);
  if (p.achieved) {
    return { remain: "達成 🎉", remainMuted: true, ratio: 1, sub: `${covered} / ${p.daysInMonth}日 投稿` };
  }
  // まだ達成可能。埋めるべき穴があれば穴埋めを最優先で促す。
  if (p.status.unfilled > 0) {
    return {
      remain: `穴埋め ${p.status.unfilled}日`,
      remainMuted: false,
      ratio,
      sub: `${covered}/${p.daysInMonth}日 ・ ${makeupHint(p, isOwner)}`,
    };
  }
  return {
    remain: daysLeft > 0 ? `あと${daysLeft}日` : "あと少し",
    remainMuted: false,
    ratio,
    sub: `${covered} / ${p.daysInMonth}日投稿 ・ このまま毎日投稿しよう！`,
  };
}

/**
 * 「次のステップ」（あと少しで届く目標のナビ）。
 * 当月の皆勤賞を常にトップ固定し、残り枠を達成率の高い未獲得ラダーで埋める。
 * 当月の皆勤賞が不可能になったら、トップは月間投稿日数の次の目標に差し替える。
 * 追加クエリは当月皆勤の集計のみ（currentMonthPerfect として親から渡す）。
 */
export function NextGoals({
  grantedKeys,
  ladderValues,
  currentMonthPerfect,
  isOwner,
  onOpen,
  onOpenPerfect,
  onOpenMonthDays,
}: {
  grantedKeys: Set<string>;
  ladderValues: Record<string, number>;
  currentMonthPerfect: CurrentMonthPerfect;
  /** 閲覧者がこのページの主本人か（残ポイントなど本人限定の値の出し分け）。 */
  isOwner: boolean;
  /** ラダーゴールのタップ（該当実績の詳細モーダルを開く）。 */
  onOpen: (achievementKey: string) => void;
  /** 皆勤カードのタップ（皆勤賞の詳細モーダルを開く）。 */
  onOpenPerfect: () => void;
  /** 月間投稿日数カードのタップ（月間投稿の詳細モーダルを開く）。 */
  onOpenMonthDays: () => void;
}) {
  const goals: NextGoal[] = ladderNextGoals(grantedKeys, ladderValues).slice(0, MAX_LADDER_GOALS);
  const p = currentMonthPerfect;
  const perfectOut = !p.achieved && !p.status.stillAchievable;
  const pc = perfectOut ? monthDaysCardProps(p) : perfectCardProps(p, isOwner);

  return (
    <section>
      <SectionTitle icon={Footprints} title="次のステップ" />
      <div className="space-y-2">
        <GoalCard
          icon={perfectOut ? <CalendarCheck className="h-5 w-5" /> : <Crown className="h-5 w-5" />}
          title={perfectOut ? "今月の投稿日数" : "今月の皆勤賞"}
          pinned
          remain={pc.remain}
          remainMuted={pc.remainMuted}
          ratio={pc.ratio}
          sub={pc.sub}
          onClick={perfectOut ? onOpenMonthDays : onOpenPerfect}
        />
        {goals.map((g) => (
          <GoalCard
            key={g.ladderKey}
            icon={<AchievementIcon name={g.icon} className="h-5 w-5" />}
            title={g.title}
            remain={`あと${g.remaining}${g.unit}`}
            ratio={g.ratio}
            sub={`現在 ${g.current} / ${g.target}${g.unit} ・ 達成率 ${Math.round(g.ratio * 100)}%`}
            onClick={() => onOpen(g.achievementKey)}
          />
        ))}
      </div>
    </section>
  );
}
