"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { AchievementIcon } from "./AchievementIcon";
import {
  CATALOG,
  CATALOG_BY_KEY,
  ACHIEVEMENT_LAYOUT,
  LADDER_META,
  PERFECT_MONTH_CATEGORY,
  type AchievementDef,
  type AchievementRank,
} from "@/lib/achievements/catalog";

export interface GrantedItem {
  key: string;
  category: string;
  grantedAt: string; // ISO
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** 単発実績・皆勤賞の1枚カード。secret かつ未達成のあいだは内容を「？？？」で隠す。
 *  ランク（金/銀）は取得して初めて色付きの●で分かる（未取得時は表示しない）。 */
function SingleCard({
  icon,
  title,
  description,
  grantedAt,
  rank,
  secret = false,
}: {
  icon: string;
  title: string;
  description: string;
  grantedAt?: string;
  rank: AchievementRank;
  secret?: boolean;
}) {
  const achieved = grantedAt != null;
  // シークレット未達成: タイトル・説明を伏せる（アイコンは隠さない）
  const hidden = secret && !achieved;
  const displayTitle = hidden ? "？？？" : title;
  const displayDescription = hidden ? "？？？" : description;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border p-2 transition-colors",
        achieved
          ? "border-amber-300/70 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30"
          : "border-border bg-muted/30 opacity-60 grayscale"
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          achieved
            ? "bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
            : "bg-muted text-muted-foreground"
        )}
      >
        <AchievementIcon name={icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13px] font-semibold leading-tight", !achieved && "text-muted-foreground")}>
          {displayTitle}
        </p>
        {/* 2行目の説明の前に、取得時のみランク色の● を表示（未取得は金銀不明） */}
        <p className="mt-0.5 flex items-center gap-1 text-[10px] leading-snug text-muted-foreground">
          {achieved && (
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                rank === "gold" ? "bg-amber-500" : "bg-slate-400"
              )}
            />
          )}
          {displayDescription}
        </p>
        {achieved && (
          <p className="mt-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            {formatDate(grantedAt)} に獲得
          </p>
        )}
      </div>
    </div>
  );
}

/** 段階実績（同じ実績の閾値違い）をまとめた1枚カード。タップで達成履歴を展開。 */
function LadderCard({
  ladderKey,
  defs,
  grantedMap,
}: {
  ladderKey: string;
  defs: AchievementDef[];
  grantedMap: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const meta = LADDER_META[ladderKey];
  const tiers = [...defs].sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
  const icon = tiers[0]?.icon ?? "Trophy";
  const label = meta?.label ?? "";
  const unit = meta?.unit ?? "";

  const achievedTiers = tiers.filter((d) => grantedMap.has(d.key));
  const anyAchieved = achievedTiers.length > 0;
  const top = achievedTiers[achievedTiers.length - 1];
  // 見出しは「いま持っている称号」（＝獲得済みの最高段）。未獲得なら最初の段の称号を薄く出す。
  const headingTitle = top?.title ?? tiers[0]?.title ?? ladderKey;

  const header = (
    <>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          anyAchieved
            ? "bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
            : "bg-muted text-muted-foreground"
        )}
      >
        <AchievementIcon name={icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "text-[13px] font-semibold leading-tight",
              !anyAchieved && "text-muted-foreground"
            )}
          >
            {headingTitle}
          </p>
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
            {achievedTiers.length}/{tiers.length}
            {anyAchieved && (
              <ChevronDown
                className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
              />
            )}
          </span>
        </div>
        {/* 機能ラベル＋閾値バッジ列 */}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {label && (
            <span className="mr-0.5 text-[10px] font-medium text-muted-foreground">
              {label}
            </span>
          )}
          {tiers.map((d) => {
            const done = grantedMap.has(d.key);
            return (
              <span
                key={d.key}
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  done
                    ? d.rank === "gold"
                      ? "bg-amber-500 text-white"
                      : "bg-slate-400 text-white"
                    : "bg-muted text-muted-foreground/70 opacity-70"
                )}
              >
                {d.tier}
              </span>
            );
          })}
        </div>
        {/* 折りたたみ時は最新の到達の獲得日（称号は見出しに出ている） */}
        {anyAchieved && top && !open && (
          <p className="mt-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            {formatDate(grantedMap.get(top.key)!)} に獲得
          </p>
        )}
      </div>
    </>
  );

  return (
    <div
      className={cn(
        "rounded-lg border p-2 transition-colors",
        anyAchieved
          ? "border-amber-300/70 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30"
          : "border-border bg-muted/30 opacity-60 grayscale"
      )}
    >
      {anyAchieved ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-start gap-2 text-left"
        >
          {header}
        </button>
      ) : (
        <div className="flex items-start gap-2">{header}</div>
      )}

      {/* 展開: 達成した全段階の日付履歴（新しい順） */}
      {open && anyAchieved && (
        <ul className="mt-2 space-y-1 border-t pt-2">
          {[...achievedTiers].reverse().map((d) => (
            <li
              key={d.key}
              className="flex items-baseline justify-between gap-2 text-[10px]"
            >
              <span className="min-w-0 font-medium">
                {d.title}
                <span className="ml-1 text-muted-foreground tabular-nums">
                  ({d.tier}
                  {unit})
                </span>
              </span>
              <span className="shrink-0 text-amber-700 dark:text-amber-400">
                {formatDate(grantedMap.get(d.key)!)} に獲得
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "perfect-month:2026-05" → "2026年5月" */
function monthLabel(key: string): string {
  const ym = key.slice(PERFECT_MONTH_CATEGORY.length + 1); // "2026-05"
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

/** 皆勤賞カード。ラダー風に、獲得した月をチップで列挙する（金固定）。タップで獲得日を展開。 */
function PerfectMonthCard({ months }: { months: GrantedItem[] }) {
  const [open, setOpen] = useState(false);
  const sorted = [...months].sort((a, b) => a.key.localeCompare(b.key)); // 古い月順
  const any = sorted.length > 0;

  const header = (
    <>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          any
            ? "bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
            : "bg-muted text-muted-foreground"
        )}
      >
        <AchievementIcon name="Crown" className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "text-[13px] font-semibold leading-tight",
              !any && "text-muted-foreground"
            )}
          >
            皆勤賞
          </p>
          {any && (
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
              {sorted.length}回
              <ChevronDown
                className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
              />
            </span>
          )}
        </div>
        {any ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {sorted.map((g) => (
              <span
                key={g.key}
                className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
              >
                {monthLabel(g.key)}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
            ひと月のすべての日に投稿すると獲得できます
          </p>
        )}
      </div>
    </>
  );

  return (
    <div
      className={cn(
        "rounded-lg border p-2 transition-colors",
        any
          ? "border-amber-300/70 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30"
          : "border-border bg-muted/30 opacity-60 grayscale"
      )}
    >
      {any ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-start gap-2 text-left"
        >
          {header}
        </button>
      ) : (
        <div className="flex items-start gap-2">{header}</div>
      )}

      {open && any && (
        <ul className="mt-2 space-y-1 border-t pt-2">
          {sorted.map((g) => (
            <li
              key={g.key}
              className="flex items-baseline justify-between gap-2 text-[10px]"
            >
              <span className="font-medium">{monthLabel(g.key)}</span>
              <span className="text-amber-700 dark:text-amber-400">
                {formatDate(g.grantedAt)} に獲得
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AchievementsView({ granted }: { granted: GrantedItem[] }) {
  const grantedMap = useMemo(
    () => new Map(granted.map((g) => [g.key, g.grantedAt])),
    [granted]
  );

  // 皆勤賞（動的・毎月+1）
  const perfectMonths = useMemo(
    () => granted.filter((g) => g.category === PERFECT_MONTH_CATEGORY),
    [granted]
  );

  return (
    <div className="space-y-6">
      {ACHIEVEMENT_LAYOUT.map((section) => (
        <section key={section.title}>
          <h2 className="mb-2 text-sm font-bold">{section.title}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {section.blocks.map((block) => {
              if (block.kind === "perfectMonth") {
                return <PerfectMonthCard key="perfect-month" months={perfectMonths} />;
              }
              if (block.kind === "ladder") {
                const defs: AchievementDef[] = CATALOG.filter(
                  (d) => d.ladderKey === block.ladderKey
                );
                return (
                  <LadderCard
                    key={block.ladderKey}
                    ladderKey={block.ladderKey}
                    defs={defs}
                    grantedMap={grantedMap}
                  />
                );
              }
              // single
              const def = CATALOG_BY_KEY.get(block.key);
              if (!def) return null;
              return (
                <SingleCard
                  key={def.key}
                  icon={def.icon}
                  title={def.title}
                  description={def.description}
                  grantedAt={grantedMap.get(def.key)}
                  rank={def.rank}
                  secret={def.secret}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
