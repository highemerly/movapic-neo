import { Trophy, Crown, ListChecks, Sparkles } from "lucide-react";
import { collectionSummary } from "@/lib/achievements/score";
import { LegalInfoDialog } from "@/components/legal/LegalInfoDialog";
import type { GrantedItem } from "./AchievementsView";

/** 皆勤賞の説明を開く「？」ボタン（ログインページの「？」と同じ体裁）。 */
function PerfectHelp({ grace }: { grace: number }) {
  return (
    <LegalInfoDialog
      title="皆勤賞とは"
      trigger={
        <button
          type="button"
          aria-label="皆勤賞とは"
          className="relative flex size-4 items-center justify-center rounded-full border border-border text-[10px] leading-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground before:absolute before:-inset-2 before:content-['']"
        >
          ？
        </button>
      }
    >
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>皆勤賞は、SHAMEZOにおける最も栄誉のある実績です。1ヶ月の間、毎日1枚以上投稿するとその月の皆勤賞を獲得できます。</p>
        <p>
          うっかり忘れた日があっても、月{grace}日までは救済措置があります。忘れた日より後日に1日2枚以上投稿すると、投稿できなかった日の穴埋めとして使われます。
        </p>
        <p>穴埋め状況はカレンダーでも確認できます。</p>
      </div>
    </LegalInfoDialog>
  );
}

/** レベルのリング（現レベル内の進捗を円弧で表す）。 */
function LevelRing({ level, ratio, toNext }: { level: number; ratio: number; toNext: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0">
      <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden>
        <circle cx="52" cy="52" r={r} fill="none" stroke="currentColor" strokeWidth="11" className="text-muted-foreground/20" />
        <circle
          cx="52"
          cy="52"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, ratio)))}
          transform="rotate(-90 52 52)"
          className="text-amber-500 transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-[26px] font-extrabold leading-none tabular-nums tracking-tight">
            Lv.{level}
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">次まで {toNext}pt</div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  icon,
  children,
}: {
  label: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-[17px] font-extrabold leading-tight tracking-tight tabular-nums">
        {children}
      </div>
    </div>
  );
}

/**
 * コレクションメーター（実績タブ最上部のヒーロー）。
 * 主役は単調増加のレベル（実績追加で下がらない）。コンプ率＝図鑑は副次表示。
 * 追加クエリ不要（granted からすべて算出）。
 */
export function CollectionMeter({
  granted,
  perfectMonthGrace,
}: {
  granted: GrantedItem[];
  perfectMonthGrace: number;
}) {
  const s = collectionSummary(granted);
  const ratio = s.level.span > 0 ? s.level.intoLevel / s.level.span : 1;

  return (
    <div className="flex flex-col items-center gap-4 py-1 min-[360px]:flex-row sm:gap-5">
      <LevelRing level={s.level.level} ratio={ratio} toNext={s.level.toNext} />
      <div className="grid w-full grid-cols-2 gap-x-4 gap-y-3 min-[360px]:w-auto min-[360px]:flex-1">
        <Stat label="獲得" icon={<ListChecks className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}>
          {s.catalog.achieved}
          <span className="text-[11px] font-semibold text-muted-foreground"> / {s.catalog.total}</span>
        </Stat>
        <Stat label="種別" icon={<Trophy className="h-3.5 w-3.5 fill-amber-400 text-amber-600" />}>
          <span className="flex items-center gap-2.5">
            <span className="flex items-center gap-1">
              <Trophy className="h-4 w-4 fill-amber-400 text-amber-600" />
              {s.gold}
            </span>
            <span className="flex items-center gap-1">
              <Trophy className="h-4 w-4 fill-slate-300 text-slate-500" />
              {s.silver}
            </span>
          </span>
        </Stat>
        <Stat
          label={
            <span className="flex items-center gap-1">
              皆勤賞
              <PerfectHelp grace={perfectMonthGrace} />
            </span>
          }
          icon={<Crown className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}
        >
          {s.perfectMonths}
          <span className="text-[11px] font-semibold text-muted-foreground"> ヶ月</span>
        </Stat>
        <Stat label="ポイント" icon={<Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}>
          {s.xp.toLocaleString()}
          <span className="text-[11px] font-semibold text-muted-foreground"> pt</span>
        </Stat>
      </div>
    </div>
  );
}
