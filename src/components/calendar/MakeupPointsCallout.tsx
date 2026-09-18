"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "@/components/Link";
import { LegalInfoDialog } from "@/components/legal/LegalInfoDialog";
import { makeupPointReasonLabel } from "@/lib/makeup/notificationTypes";

/** カレンダーAPI（perfectMonth.makeup）の形。owner のときだけ返る。 */
export interface MakeupInfo {
  /** ポイント制（2026-10 以降）の月か。false なら limit は所属インスタンスで決まる固定の日数。 */
  pointEra: boolean;
  limit: number;
  used: number;
  /** 埋めている穴の日（昇順）。 */
  usedDays: number[];
  remaining: number;
  /** まだ埋まっていない未投稿日の数（当月は昨日まで）。 */
  unfilled: number;
  /** 締切（この時刻より前なら編集可・排他上限）。ISO 8601。 */
  deadline: string;
  editable: boolean;
  grants: Array<{ reason: string; amount: number; grantedAt: string }>;
}

const JST = "Asia/Tokyo";

/**
 * 締切の表示。API の deadline は「翌月11日 00:00 JST」の排他上限なので、
 * 人に見せるときは1分戻して「翌月10日 23:59まで」にする。
 */
export function formatMakeupDeadline(deadlineIso: string): string {
  const d = new Date(new Date(deadlineIso).getTime() - 60 * 1000);
  return d.toLocaleString("ja-JP", {
    timeZone: JST,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatGrantDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", { timeZone: JST, month: "numeric", day: "numeric" });
}

/**
 * 案内の中のモーダルを開くボタン。小さな枠付きチップにして、ボタンだと分かるようにする。
 * 文言は短く保つ（3つがスマホ幅でも1行に収まるように。モーダルのタイトルで正式名を出す）。
 */
function ChipButton({ children, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex items-center gap-0.5 rounded-full border border-amber-400/70 bg-white/60 py-0.5 pl-2.5 pr-1.5 text-[11px] font-semibold transition-colors hover:bg-white dark:border-amber-700/70 dark:bg-amber-950/40 dark:hover:bg-amber-900/50"
    >
      {children}
      <ChevronRight className="h-3 w-3" />
    </button>
  );
}

/**
 * 本人向けの「穴埋めポイント」案内（カレンダー上部）。
 * 常に見せるのは1行（未投稿の日数と残りポイント）だけで、説明と各モーダルへのボタンは折りたたむ
 * （スマホでカレンダーの上が縦に長くならないように）。既定は閉じた状態。
 * 値は月送りに追従させるため、ページからの固定 prop ではなくカレンダーAPIのレスポンスから受け取る
 * （ポイント制では月ごとに上限が違う）。
 */
export function MakeupPointsCallout({
  month,
  makeup,
  favorServers,
}: {
  month: number;
  makeup: MakeupInfo;
  /** 特典サーバー（FAVOR_SERVERS）のドメイン一覧。獲得方法の説明に使う。 */
  favorServers: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-3 rounded-lg border border-amber-300/70 bg-amber-50 text-[12px] leading-relaxed text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Crown className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 font-semibold">皆勤賞を目指そう！</span>
        <span className="shrink-0 whitespace-nowrap tabular-nums">
          未投稿<span className="mx-0.5 text-base font-extrabold leading-none">{makeup.unfilled}</span>日
          <span className="mx-1.5 opacity-50">/</span>
          残り<span className="mx-0.5 text-base font-extrabold leading-none">{makeup.remaining}</span>pt
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="px-3 pb-2 pl-9">
          <p>
            1ヶ月間毎日投稿すれば、皆勤賞が獲得できます。投稿を忘れた日があっても、穴埋めポイントを使って後日の投稿で穴埋めすることもできます。
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <LegalInfoDialog title="皆勤賞のルール" trigger={<ChipButton>詳細なルール</ChipButton>}>
              <PerfectMonthRules month={month} makeup={makeup} />
            </LegalInfoDialog>
            <LegalInfoDialog title="穴埋めポイント" trigger={<ChipButton>穴埋めポイント</ChipButton>}>
              <div className="space-y-4">
                <section>
                  <p className="mb-1.5 text-sm font-semibold">獲得方法</p>
                  <MakeupPointConditions favorServers={favorServers} />
                </section>
                <section>
                  <p className="mb-1.5 text-sm font-semibold">{month}月の付与・消費</p>
                  <MakeupGrantHistory
                    month={month}
                    grants={makeup.grants}
                    usedDays={makeup.usedDays}
                    favorServers={favorServers}
                  />
                </section>
                <p className="text-sm text-muted-foreground">穴埋めポイントは翌月に持ち越せません。</p>
              </div>
            </LegalInfoDialog>
          </div>
        </div>
      )}
    </div>
  );
}

/** 皆勤賞のルールと、その救済としての穴埋めの説明（カレンダー向けの簡略版。正確な仕様は /docs/spec）。 */
function PerfectMonthRules({ month, makeup }: { month: number; makeup: MakeupInfo }) {
  return (
    <div className="space-y-4 text-sm text-muted-foreground">
      <section>
        <p className="mb-1.5 font-semibold text-foreground">皆勤賞</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>その月に毎日1枚以上投稿すると獲得できます</li>
          <li>1日の区切りは日本時間の 0:00〜23:59 です</li>
          <li>月ごとに判定するので、毎月獲得できます</li>
          <li>獲得した皆勤賞は、カレンダーと実績タブで公開されます</li>
        </ul>
      </section>
      <section>
        <p className="mb-1.5 font-semibold text-foreground">穴埋め</p>
        <p>
          投稿を忘れた日があっても、その日より後に1日2枚以上投稿し、カレンダーの「編集」で埋める日を選ぶと、2枚目の投稿でその日を&ldquo;穴埋め&rdquo;できます。穴埋めした日は投稿した日と同じく皆勤賞に数えます。
        </p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5">
          <li>1日ぶんの穴埋めに、穴埋めポイントを1pt消費します</li>
          <li>穴埋めに使える投稿は1日1枚までです（月をまたいでも同じです）</li>
          <li>埋められるのは、穴埋めに使う投稿の日より前の日だけです（未来の日は埋められません）</li>
          <li>締め切りまでに投稿していれば、翌月の投稿も前月の穴埋めに使えます（月末の日もこれで埋められます）</li>
          <li>
            その月の穴埋めは翌月10日 23:59 までできます
            <span className="font-semibold text-foreground">
              （{month}月分は{formatMakeupDeadline(makeup.deadline)}
              {makeup.editable ? "まで" : "で締め切りました"}）
            </span>
          </li>
        </ul>
      </section>
      <p>
        <Link href="/docs/spec#perfect-month" className="underline underline-offset-2 hover:text-foreground">
          皆勤賞の仕様をくわしく見る
        </Link>
      </p>
    </div>
  );
}

/** 穴埋めポイントの獲得方法（カレンダー向けの簡略版。正確な条件は /docs/spec）。 */
function MakeupPointConditions({ favorServers }: { favorServers: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      {favorServers.length > 0 && <li>{favorServers.join("・")} のユーザー: 毎月+1pt</li>}
      <li>先月の皆勤賞を獲得しなかった場合: +1pt（毎月11日頃に付与）</li>
      <li>その月に何かしらの実績を獲得した場合: +1pt（月に1回まで）</li>
      <li>このほか、イベントなどでもらえることがあります</li>
    </ul>
  );
}

/**
 * その月の付与と消費。付与は日時つきの履歴、消費は「今どの日を埋めているか」だけ
 * （消費は Image.makeupTargetDay から導出していて、いつ使ったかは記録していないため）。
 */
function MakeupGrantHistory({
  month,
  grants,
  usedDays,
  favorServers,
}: {
  month: number;
  grants: MakeupInfo["grants"];
  usedDays: number[];
  favorServers: string[];
}) {
  if (grants.length === 0 && usedDays.length === 0) {
    return <p className="text-sm text-muted-foreground">この月はまだポイントが付与されていません。</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {grants.map((g) => (
        <li key={`${g.reason}-${g.grantedAt}`} className="flex justify-between gap-3 tabular-nums">
          <span className="text-muted-foreground">
            {formatGrantDate(g.grantedAt)}　{makeupPointReasonLabel(g.reason, favorServers)}
          </span>
          <span className="font-semibold">+{g.amount}pt</span>
        </li>
      ))}
      {usedDays.length > 0 && grants.length > 0 && <li aria-hidden className="border-t" />}
      {usedDays.map((day) => (
        <li key={`used-${day}`} className="flex justify-between gap-3 tabular-nums">
          <span className="text-muted-foreground">
            {month}/{day}の穴埋め
          </span>
          <span className="font-semibold">−1pt</span>
        </li>
      ))}
    </ul>
  );
}
