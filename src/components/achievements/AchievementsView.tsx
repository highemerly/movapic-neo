"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AchievementIcon } from "./AchievementIcon";
import { CollectionMeter } from "./CollectionMeter";
import { NextGoals } from "./NextGoals";
import { SectionTitle } from "./SectionTitle";
import type { CurrentMonthPerfect } from "@/lib/achievements/stats";
import {
  CATALOG,
  CATALOG_BY_KEY,
  ACHIEVEMENT_LAYOUT,
  LADDER_META,
  MONTH_DAYS_CATEGORY,
  PERFECT_MONTH_CATEGORY,
  SEASON_CATEGORY,
  resolveAchievement,
  type AchievementDef,
  type AchievementRank,
} from "@/lib/achievements/catalog";
import {
  MONTH_DAYS_TIERS,
  parseMonthDaysKey,
  withoutAbsorbedMonthDays,
} from "@/lib/achievements/monthDays";

export interface GrantedItem {
  key: string;
  category: string;
  grantedAt: string; // ISO
}

// ディープリンク（?a=）到達時の獲得演出で散らすキラキラの配置（決め打ち）。
// 投稿直後の AchievementCelebration と同じ animate-sparkle を流用する。
const SPARKLES = [
  { top: "10%", left: "8%", size: 16, delay: "0s" },
  { top: "14%", left: "88%", size: 13, delay: "0.2s" },
  { top: "72%", left: "6%", size: 15, delay: "0.4s" },
  { top: "80%", left: "90%", size: 18, delay: "0.1s" },
  { top: "44%", left: "3%", size: 11, delay: "0.5s" },
  { top: "40%", left: "94%", size: 11, delay: "0.3s" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** "2026-05" → "2026年5月" */
function ymLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

/** "perfect-month:2026-05" → "2026年5月" */
function monthLabel(key: string): string {
  return ymLabel(key.slice(PERFECT_MONTH_CATEGORY.length + 1));
}

const MONTH_DAYS_DESCRIPTION = `1ヶ月のうち${MONTH_DAYS_TIERS.join("日・")}日投稿すると獲得できます（穴埋めした日は数えません）`;

/** 金/銀トロフィーのアイコン（中を塗りつぶし）。 */
function RankBadge({ rank, className }: { rank: AchievementRank; className?: string }) {
  return (
    <Trophy
      aria-hidden
      className={cn(
        "shrink-0",
        rank === "gold" ? "fill-amber-400 text-amber-600" : "fill-slate-300 text-slate-500",
        className
      )}
    />
  );
}

// --- 一覧の各エントリを「タイル＋詳細」を出せる共通モデルに正規化する ---

interface TileModel {
  icon: string;
  /** 一覧に出す名前（シークレット未達成・未獲得ラダーは「？？？」） */
  name: string;
  /** 取得済みのときだけ金/銀。未取得は null（一覧にトロフィーを出さない） */
  rank: AchievementRank | null;
  achieved: boolean;
  /** ラダーのみ: 全段階の進捗ドット（獲得済みは段のランク色、未獲得は薄色） */
  progress?: { rank: AchievementRank; done: boolean }[];
}

type Entry =
  | { id: string; kind: "single"; def: AchievementDef }
  | { id: string; kind: "ladder"; ladderKey: string; defs: AchievementDef[] }
  | { id: string; kind: "perfectMonth" }
  | { id: string; kind: "monthDays" }
  | { id: string; kind: "season" };

/** 動的キーの実績（皆勤賞・月間投稿日数・シーズン）を系列ごとに分けたもの。 */
interface DynamicGranted {
  perfectMonths: GrantedItem[];
  monthDays: GrantedItem[];
  seasons: GrantedItem[];
}

/** 実績 key（単発キー・ラダーの段キー・動的キーのいずれか）が、このエントリのモーダルで表示されるか。 */
function entryMatchesKey(entry: Entry, key: string): boolean {
  if (entry.kind === "single") return entry.def.key === key;
  if (entry.kind === "ladder") return entry.defs.some((d) => d.key === key);
  if (entry.kind === "season") return key.startsWith(`${SEASON_CATEGORY}:`);
  if (entry.kind === "monthDays") return parseMonthDaysKey(key) != null;
  return key.startsWith(`${PERFECT_MONTH_CATEGORY}:`); // perfectMonth
}

/** エントリが1つでも獲得済みか（獲得演出を出してよいかの判定に使う）。 */
function isEntryAchieved(entry: Entry, grantedMap: Map<string, string>, dyn: DynamicGranted): boolean {
  if (entry.kind === "single") return grantedMap.has(entry.def.key);
  if (entry.kind === "ladder") return entry.defs.some((d) => grantedMap.has(d.key));
  if (entry.kind === "season") return dyn.seasons.length > 0;
  if (entry.kind === "monthDays") return dyn.monthDays.length > 0;
  return dyn.perfectMonths.length > 0;
}

/** 月間投稿日数の獲得を月ごとにまとめる（新しい月順）。tiers は到達した段の昇順。 */
function groupMonthDays(items: GrantedItem[]): { ym: string; tiers: number[]; grantedAt: string }[] {
  const byYm = new Map<string, { tiers: number[]; grantedAt: string }>();
  for (const g of items) {
    const parsed = parseMonthDaysKey(g.key);
    if (!parsed) continue;
    const cur = byYm.get(parsed.ym) ?? { tiers: [], grantedAt: g.grantedAt };
    cur.tiers.push(parsed.tier);
    // 獲得日は最上段に届いた日（その月の到達点として見せる）
    if (g.grantedAt > cur.grantedAt) cur.grantedAt = g.grantedAt;
    byYm.set(parsed.ym, cur);
  }
  return [...byYm.entries()]
    .map(([ym, v]) => ({ ym, tiers: v.tiers.sort((a, b) => a - b), grantedAt: v.grantedAt }))
    .sort((a, b) => b.ym.localeCompare(a.ym));
}

function tileModel(entry: Entry, grantedMap: Map<string, string>, dyn: DynamicGranted): TileModel {
  const { perfectMonths, seasons, monthDays } = dyn;
  if (entry.kind === "single") {
    const { def } = entry;
    const achieved = grantedMap.has(def.key);
    const hidden = def.secret && !achieved;
    return {
      icon: def.icon,
      name: hidden ? "？？？" : def.title,
      rank: achieved ? def.rank : null,
      achieved,
    };
  }
  if (entry.kind === "ladder") {
    const tiers = [...entry.defs].sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
    const achievedTiers = tiers.filter((d) => grantedMap.has(d.key));
    const top = achievedTiers[achievedTiers.length - 1];
    return {
      icon: tiers[0]?.icon ?? "Trophy",
      // 称号は「獲得済みの最上段」を出す。1段も獲っていない時は例外的に最初の段の称号を出す
      // （何を目指す系列か分かるように。途中まで獲った後の上位段だけ ？？？ で伏せる）。
      name: top?.title ?? tiers[0]?.title ?? entry.ladderKey,
      rank: top?.rank ?? null,
      achieved: achievedTiers.length > 0,
      progress: tiers.map((d) => ({ rank: d.rank, done: grantedMap.has(d.key) })),
    };
  }
  if (entry.kind === "season") {
    // シーズン（段数は固定でなく参加シーズンごとに増える。獲得数ぶん金ドットを並べる）
    const any = seasons.length > 0;
    return {
      icon: "Sparkles",
      name: "シーズン",
      rank: any ? "gold" : null,
      achieved: any,
      progress: any
        ? seasons.map(() => ({ rank: "gold" as const, done: true }))
        : [{ rank: "gold" as const, done: false }],
    };
  }
  if (entry.kind === "monthDays") {
    // 月間投稿日数（毎月増える。獲得した段の数ぶん銀ドットを並べる）
    const any = monthDays.length > 0;
    return {
      icon: "CalendarCheck",
      name: "月間投稿",
      rank: any ? "silver" : null,
      achieved: any,
      progress: any
        ? monthDays.map(() => ({ rank: "silver" as const, done: true }))
        : [{ rank: "silver" as const, done: false }],
    };
  }
  // perfectMonth（段数は固定でなく毎月増えるので、獲得した月の数ぶん金ドットを並べる）
  const any = perfectMonths.length > 0;
  return {
    icon: "Crown",
    name: "皆勤賞",
    rank: any ? "gold" : null,
    achieved: any,
    progress: any
      ? perfectMonths.map(() => ({ rank: "gold" as const, done: true }))
      : [{ rank: "gold" as const, done: false }],
  };
}

/** 一覧の1マス。アイコン＋名前＋金/銀メダルのみ。タップで詳細モーダル。 */
function Tile({ model, onClick }: { model: TileModel; onClick: () => void }) {
  const { icon, name, rank, achieved } = model;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition-colors",
        achieved
          ? "border-amber-300/70 bg-amber-50 hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
          : "border-border bg-muted/30 hover:bg-muted/60"
      )}
    >
      <span className="relative">
        <span
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full",
            achieved
              ? "bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
              : "bg-muted text-muted-foreground"
          )}
        >
          <AchievementIcon name={icon} className="h-5 w-5" />
        </span>
        {rank && (
          <span className="absolute -right-1 -bottom-1 rounded-full bg-background p-px shadow-sm">
            <RankBadge rank={rank} className="h-4 w-4" />
          </span>
        )}
      </span>
      <span
        className={cn(
          "line-clamp-2 text-[11px] font-medium leading-tight",
          !achieved && "text-muted-foreground"
        )}
      >
        {name}
      </span>
      {model.progress && (
        <span className="mt-auto flex flex-wrap items-center justify-center gap-0.5 pt-0.5">
          {model.progress.map((p, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                p.done
                  ? p.rank === "gold"
                    ? "bg-amber-500"
                    : "bg-slate-400"
                  : "bg-muted-foreground/25"
              )}
            />
          ))}
        </span>
      )}
    </button>
  );
}

/** 詳細モーダルの中身。ラダーは過去の獲得日を含む全段階を表示する。 */
function DetailBody({
  entry,
  grantedMap,
  ladderValues,
  dyn,
  celebrate = false,
}: {
  entry: Entry;
  grantedMap: Map<string, string>;
  ladderValues: Record<string, number>;
  dyn: DynamicGranted;
  /** 獲得演出中はアイコンをポップさせる（ディープリンク到達時のみ true） */
  celebrate?: boolean;
}) {
  if (entry.kind === "single") {
    const { def } = entry;
    const grantedAt = grantedMap.get(def.key);
    const achieved = grantedAt != null;
    const hidden = def.secret && !achieved;
    return (
      <DetailShell
        icon={def.icon}
        title={hidden ? "？？？" : def.title}
        rank={achieved ? def.rank : null}
        achieved={achieved}
        celebrate={celebrate}
        description={hidden ? "達成すると公開されるシークレット実績です" : def.description}
      >
        {achieved ? (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            {formatDate(grantedAt)} に獲得
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">まだ獲得していません</p>
        )}
      </DetailShell>
    );
  }

  if (entry.kind === "ladder") {
    const meta = LADDER_META[entry.ladderKey];
    const tiers = [...entry.defs].sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
    const achievedTiers = tiers.filter((d) => grantedMap.has(d.key));
    const top = achievedTiers[achievedTiers.length - 1];
    const any = achievedTiers.length > 0;
    // 次に獲得できる段（未獲得のうち最も下の段）。1段も獲っていなければ最初の段。
    // ここまでは称号を見せ、それより上は ？？？ で伏せる。
    const nextTier = tiers.find((d) => !grantedMap.has(d.key));
    const unit = meta?.unit ?? "";
    const currentValue = ladderValues[entry.ladderKey] ?? 0;
    return (
      <DetailShell
        icon={tiers[0]?.icon ?? "Trophy"}
        title={top?.title ?? tiers[0]?.title ?? entry.ladderKey}
        rank={top?.rank ?? null}
        achieved={any}
        celebrate={celebrate}
        description={
          meta ? `${meta.label}：現在 ${currentValue}${unit}` : undefined
        }
      >
        <ul className="space-y-1.5">
          {[...tiers].reverse().map((d) => {
            const at = grantedMap.get(d.key);
            const done = at != null;
            return (
              <li
                key={d.key}
                className={cn(
                  "flex items-center justify-between gap-2 text-xs",
                  !done && "text-muted-foreground"
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {done ? (
                    <RankBadge rank={d.rank} className="h-3.5 w-3.5" />
                  ) : (
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/40" />
                  )}
                  <span className="truncate font-medium">
                    {done || d.key === nextTier?.key ? d.title : "？？？"}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    ({d.tier}
                    {unit})
                  </span>
                </span>
                <span className="shrink-0 text-[11px]">
                  {done ? (
                    <span className="text-amber-700 dark:text-amber-400">
                      {formatDate(at)}
                    </span>
                  ) : (
                    "未達成"
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </DetailShell>
    );
  }

  if (entry.kind === "monthDays") {
    const months = groupMonthDays(dyn.monthDays);
    const any = months.length > 0;
    return (
      <DetailShell
        icon="CalendarCheck"
        title="月間投稿"
        rank={any ? "silver" : null}
        achieved={any}
        celebrate={celebrate}
        description={MONTH_DAYS_DESCRIPTION}
      >
        {any ? (
          <ul className="space-y-1.5">
            {months.map((mo) => (
              <li key={mo.ym} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 font-medium">
                  <RankBadge rank="silver" className="h-3.5 w-3.5" />
                  {ymLabel(mo.ym)}
                  <span className="tabular-nums text-muted-foreground">
                    （{mo.tiers[mo.tiers.length - 1]}日投稿）
                  </span>
                </span>
                <span className="text-[11px] text-amber-700 dark:text-amber-400">
                  {formatDate(mo.grantedAt)} に獲得
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">まだ獲得していません</p>
        )}
      </DetailShell>
    );
  }

  if (entry.kind === "season") {
    const sorted = [...dyn.seasons].sort((a, b) => b.grantedAt.localeCompare(a.grantedAt)); // 新しい獲得順
    const any = sorted.length > 0;
    return (
      <DetailShell
        icon="Sparkles"
        title="シーズン（期間限定）"
        rank={any ? "gold" : null}
        achieved={any}
        celebrate={celebrate}
        description="期間限定シーズンに投稿すると、そのシーズンの記念実績を獲得できます"
      >
        {any ? (
          <ul className="space-y-1.5">
            {sorted.map((g) => (
              <li
                key={g.key}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <RankBadge rank="gold" className="h-3.5 w-3.5" />
                  {resolveAchievement(g.key).title}
                </span>
                <span className="text-[11px] text-amber-700 dark:text-amber-400">
                  {formatDate(g.grantedAt)} に獲得
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">まだ獲得していません</p>
        )}
      </DetailShell>
    );
  }

  // perfectMonth
  const sorted = [...dyn.perfectMonths].sort((a, b) => b.key.localeCompare(a.key)); // 新しい月順
  const any = sorted.length > 0;
  return (
    <DetailShell
      icon="Crown"
      title="皆勤賞"
      rank={any ? "gold" : null}
      achieved={any}
      celebrate={celebrate}
      description={PERFECT_MONTH_DESCRIPTION}
    >
      {any ? (
        <ul className="space-y-1.5">
          {sorted.map((g) => (
            <li
              key={g.key}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <RankBadge rank="gold" className="h-3.5 w-3.5" />
                {monthLabel(g.key)}
              </span>
              <span className="text-[11px] text-amber-700 dark:text-amber-400">
                {formatDate(g.grantedAt)} に獲得
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">まだ獲得していません</p>
      )}
    </DetailShell>
  );
}

/** 詳細モーダルの共通レイアウト（大きいアイコン＋タイトル＋メダル＋説明＋本文）。 */
function DetailShell({
  icon,
  title,
  rank,
  achieved,
  description,
  children,
  celebrate = false,
}: {
  icon: string;
  title: string;
  rank: AchievementRank | null;
  achieved: boolean;
  description?: string;
  children: React.ReactNode;
  /** 獲得演出中はアイコンをポップさせる */
  celebrate?: boolean;
}) {
  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3 text-left">
          <span
            className={cn(
              "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full",
              celebrate && achieved && "animate-trophy-pop",
              achieved
                ? "bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                : "bg-muted text-muted-foreground"
            )}
          >
            <AchievementIcon name={icon} className="h-7 w-7" />
            {rank && (
              <span className="absolute -right-1 -bottom-1 rounded-full bg-background p-px shadow-sm">
                <RankBadge rank={rank} className="h-5 w-5" />
              </span>
            )}
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-base">{title}</DialogTitle>
            {description && (
              <DialogDescription className="mt-0.5 text-xs">
                {description}
              </DialogDescription>
            )}
          </div>
        </div>
      </DialogHeader>
      <div className="border-t pt-3">{children}</div>
    </>
  );
}

/** 皆勤賞の説明文（当月は必ず穴埋めポイント制。2026-09 以前の旧ルールの文言は撤去済み）。 */
const PERFECT_MONTH_DESCRIPTION =
  "1ヶ月の間毎日1枚以上投稿すると獲得できます（投稿を忘れた日は、穴埋めポイントを使って後日の2枚目の投稿で穴埋めできます）";

export function AchievementsView({
  granted,
  ladderValues,
  currentMonthPerfect,
  isOwner,
}: {
  granted: GrantedItem[];
  ladderValues: Record<string, number>;
  /** 「次のステップ」の当月皆勤カード用（本人・閲覧者を問わず、このページの主の進捗を表示）。 */
  currentMonthPerfect: CurrentMonthPerfect;
  /** 閲覧者がこのページの主本人か（穴埋めの残ポイントは本人にしか出さない）。 */
  isOwner: boolean;
}) {
  const grantedMap = useMemo(
    () => new Map(granted.map((g) => [g.key, g.grantedAt])),
    [granted]
  );

  // 動的キーの実績: 皆勤賞（毎月+1）・月間投稿日数（皆勤賞を取れなかった月の到達点）・シーズン（参加シーズンごとに+1）
  const dyn = useMemo<DynamicGranted>(
    () => ({
      perfectMonths: granted.filter((g) => g.category === PERFECT_MONTH_CATEGORY),
      // 同じ月の上位（皆勤賞・20日）に吸収されたものは出さない（行は残っている。monthDays.ts）
      monthDays: withoutAbsorbedMonthDays(granted).filter((g) => g.category === MONTH_DAYS_CATEGORY),
      seasons: granted.filter((g) => g.category === SEASON_CATEGORY),
    }),
    [granted]
  );

  // レイアウトを「セクション → エントリ配列」に正規化（タイルとモーダルで共用）
  const sections = useMemo(
    () =>
      ACHIEVEMENT_LAYOUT.map((section) => ({
        title: section.title,
        entries: section.blocks
          .map((block): Entry | null => {
            if (block.kind === "perfectMonth") {
              return { id: "perfect-month", kind: "perfectMonth" };
            }
            if (block.kind === "monthDays") {
              return { id: "month-days", kind: "monthDays" };
            }
            if (block.kind === "season") {
              return { id: "season", kind: "season" };
            }
            if (block.kind === "ladder") {
              const defs = CATALOG.filter((d) => d.ladderKey === block.ladderKey);
              return { id: block.ladderKey, kind: "ladder", ladderKey: block.ladderKey, defs };
            }
            const def = CATALOG_BY_KEY.get(block.key);
            return def ? { id: def.key, kind: "single", def } : null;
          })
          .filter((e): e is Entry => e != null),
      })),
    []
  );

  // ?a=<実績key> でディープリンクされたら、該当する実績のモーダルを開いた状態でマウントする
  // （投稿直後の獲得演出・画像詳細ページの実績チップからの遷移用）。
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const aParam = searchParams.get("a");
  // 「今まさに獲得した」専用フラグ。ボット返信リンクなど、獲得直後の動線だけが付ける。
  // 画像詳細ページの実績チップ（?a= のみ）からの遷移では演出しないための区別。
  const celebrateParam = searchParams.get("celebrate") === "1";

  // マウント時に ?a= で開く初期エントリ（ボット返信・投稿直後の獲得演出からの遷移）。
  const initialEntry = useMemo(() => {
    if (!aParam) return null;
    const entries = sections.flatMap((s) => s.entries);
    return entries.find((e) => entryMatchesKey(e, aParam)) ?? null;
  }, [aParam, sections]);

  const [selected, setSelected] = useState<Entry | null>(initialEntry);

  // 獲得演出は「celebrate=1 付きで到達し、かつ獲得済み」のときだけ。
  // 通常のタイルクリックや画像詳細ページの実績チップ（?a= のみ）では演出しない。
  const [celebrate, setCelebrate] = useState<boolean>(
    () =>
      celebrateParam &&
      initialEntry != null &&
      isEntryAchieved(initialEntry, grantedMap, dyn)
  );

  const openTile = (entry: Entry) => {
    setSelected(entry);
    setCelebrate(false);
  };

  // 「もうすぐ獲れる」から実績キー／皆勤で該当エントリの詳細モーダルを開く。
  const openByKey = (key: string) => {
    const entry = sections.flatMap((s) => s.entries).find((e) => entryMatchesKey(e, key));
    if (entry) openTile(entry);
  };
  const openPerfect = () => {
    const entry = sections.flatMap((s) => s.entries).find((e) => e.kind === "perfectMonth");
    if (entry) openTile(entry);
  };
  const openMonthDays = () => {
    const entry = sections.flatMap((s) => s.entries).find((e) => e.kind === "monthDays");
    if (entry) openTile(entry);
  };

  const closeModal = () => {
    setSelected(null);
    setCelebrate(false);
    // ディープリンク経由なら URL から ?a= を消す（閉じた後に再オープンしない・履歴を汚さない）
    if (aParam) router.replace(pathname, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <CollectionMeter granted={granted} />

      <NextGoals
        grantedKeys={new Set(grantedMap.keys())}
        ladderValues={ladderValues}
        currentMonthPerfect={currentMonthPerfect}
        isOwner={isOwner}
        onOpen={openByKey}
        onOpenPerfect={openPerfect}
        onOpenMonthDays={openMonthDays}
      />

      <section>
        <SectionTitle icon={Trophy} title="実績コレクション" />
        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400/80" aria-hidden />
                {section.title}
              </h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {section.entries.map((entry) => (
                  <Tile
                    key={entry.id}
                    model={tileModel(entry, grantedMap, dyn)}
                    onClick={() => openTile(entry)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <Dialog open={selected != null} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent
          className={cn(
            celebrate &&
              "overflow-hidden border-amber-300/60 bg-gradient-to-b from-amber-50 to-white dark:border-amber-700/50 dark:from-amber-950/60 dark:to-background"
          )}
        >
          {celebrate && (
            <>
              {/* キラキラ（装飾・クリックを邪魔しない） */}
              {SPARKLES.map((s, i) => (
                <Sparkles
                  key={i}
                  aria-hidden
                  className="animate-sparkle pointer-events-none absolute text-amber-400"
                  style={{
                    top: s.top,
                    left: s.left,
                    width: s.size,
                    height: s.size,
                    animationDelay: s.delay,
                  }}
                />
              ))}
              <p className="text-center text-xs font-bold tracking-widest text-amber-600 dark:text-amber-400">
                🎉 ACHIEVEMENT
              </p>
            </>
          )}
          {selected && (
            <DetailBody
              entry={selected}
              grantedMap={grantedMap}
              ladderValues={ladderValues}
              dyn={dyn}
              celebrate={celebrate}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
