"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Crown, Pencil, Check, X, Share2 } from "lucide-react";
import { toast } from "sonner";
import { StackedSquaresIcon } from "./StackedSquaresIcon";
import { CollageShareDialog } from "./CollageShareDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isJapaneseHoliday } from "@/lib/holidays";
import { PERFECT_MONTH_GRACE_DEFAULT } from "@/lib/achievements/perfectMonth";
import { DayCell } from "./DayCell";

interface DayData {
  count: number;
  latest: {
    id: string;
    thumbnailKey: string | null;
    storageKey: string;
    position: string;
  };
}

interface FilledDay {
  day: number;
  filledBy: number;
  image: { id: string; thumbnailKey: string | null; storageKey: string };
}

interface PerfectMonthInfo {
  achieved: boolean;
  isCurrentMonth: boolean;
  callout: "today" | "tomorrow" | null;
  filledDays: FilledDay[];
}

/** owner編集モード用: 各日の全画像（chronological asc）。 */
interface OwnerDayImage {
  id: string;
  thumbnailKey: string | null;
  storageKey: string;
  isPicked: boolean;
  makeupTargetDay: number | null;
}

interface CalendarData {
  year: number;
  month: number;
  days: Record<number, DayData>;
  hasPrevMonth: boolean;
  hasNextMonth: boolean;
  isPerfectAttendance: boolean;
  perfectMonth: PerfectMonthInfo | null;
  ownerEdit?: { dayImages: Record<number, OwnerDayImage[]> };
}

interface CalendarViewProps {
  username: string;
  publicUrl: string;
  initialYear: number;
  initialMonth: number;
  /** 閲覧者がこのカレンダーの持ち主本人か（穴埋め促しコールアウトの表示制御）。 */
  isOwner: boolean;
  /** このカレンダーの持ち主の未投稿許容日数（穴埋め枠。所属インスタンスで決まる注意書きの数字）。 */
  grace: number;
  /** 投稿先サーバー名（カレンダー画像投稿ボタンの文言に使う）。 */
  serverName: string;
  /** ログイン中インスタンスの種別（"mastodon" | "misskey"）。投稿ボタンのロゴ出し分けに使う。 */
  instanceType: string;
}

/**
 * 穴埋めを促す注意書き（当月のみ）。
 * 表示するのは「まだ皆勤に届く範囲で、未埋めの穴が残る」ときだけ（callout が非 null）。
 * - "today": 本日2枚投稿すれば穴埋めできる
 * - "tomorrow": 今日はもう穴埋め済み（1日1回まで）なので翌日に促す
 * 達成/未達成のメッセージは出さない（達成時は月見出しの👑で示す）。
 */
function PerfectMonthCallout({ pm }: { pm: PerfectMonthInfo }) {
  if (!pm.callout) return null;
  const body =
    pm.callout === "today"
      ? "投稿を忘れた日があります。本日2枚投稿すれば穴埋めでき、皆勤賞に近づきます！"
      : "明日2枚投稿すると、皆勤賞に近づきます！";
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
      <Crown className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">穴埋め投稿で皆勤賞を目指そう！</p>
        <p>{body}</p>
      </div>
    </div>
  );
}

/**
 * 皆勤賞を達成した月に表示する祝祭バナー（達成月のみ・閲覧者全員に表示）。
 * 金色グラデ＋光沢走査＋王冠ポップ＋きらめきで「達成」を派手に演出する。
 */
function PerfectMonthBanner() {
  return (
    <div className="animate-celebrate-in relative mt-4 overflow-hidden rounded-xl bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 px-4 py-3 shadow-md dark:from-amber-900/50 dark:via-yellow-800/30 dark:to-amber-900/50">
      {/* 斜めの光沢が左から右へ走る */}
      <div className="animate-banner-shine pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-white/50 blur-md dark:bg-white/10" />
      <div className="relative flex items-center justify-center gap-2 text-amber-900 dark:text-amber-100">
        <span className="animate-sparkle text-lg leading-none">✨</span>
        <Crown className="animate-trophy-pop h-6 w-6 shrink-0 fill-amber-400 text-amber-600 drop-shadow-sm dark:text-amber-300" />
        <span className="text-base font-extrabold tracking-wide sm:text-lg">
          皆勤賞達成！
        </span>
        <span
          className="animate-sparkle text-lg leading-none"
          style={{ animationDelay: "0.7s" }}
        >
          ✨
        </span>
      </div>
    </div>
  );
}

export function CalendarView({
  username,
  publicUrl,
  initialYear,
  initialMonth,
  isOwner,
  grace,
  serverName,
  instanceType,
}: CalendarViewProps) {
  const router = useRouter();
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  // 月送りの方向（スライドイン演出用）。prev=左から / next=右から。
  const [direction, setDirection] = useState<"prev" | "next" | null>(null);
  // カレンダー編集モード（owner のみ）。ON中は日タップで代表選択／穴埋め割当のピッカーを開く。
  const [editMode, setEditMode] = useState(false);
  // 開いているピッカー（代表 or 穴埋め）。
  const [picker, setPicker] = useState<{ kind: "representative" | "donor"; day: number } | null>(null);
  const [saving, setSaving] = useState(false);
  // 年月ジャンプ用ピッカー（見出しタップで開く）。pickerYear はパネル内で選択中の年。
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(initialYear);
  // カレンダー画像（コラージュ）の共有ダイアログの開閉。
  const [shareOpen, setShareOpen] = useState(false);

  // 離脱時（アンマウント / タブ離脱）に「今どの月を編集中か」をハンドラから読むための ref。
  // クロージャに焼き付くと古い年月で reevaluate してしまうため常に最新へ同期する。
  const editModeRef = useRef(editMode);
  const ymRef = useRef({ year, month });
  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);
  useEffect(() => {
    ymRef.current = { year, month };
  }, [year, month]);

  // 皆勤賞の再判定（付与のみ・冪等）を beacon で投げ切る。応答は待たない＝離脱・アンロード中でも届く。
  // 編集は1操作ごとに PATCH 保存済みなので、離脱で失われるのはこの再判定だけ。どの経路で抜けても
  // ここを必ず通すことで「手動穴埋めで皆勤成立→別画面へ→👑付かず」の取りこぼしを防ぐ。
  const reevaluateBeacon = useCallback((y: number, m: number) => {
    try {
      navigator.sendBeacon?.(
        "/api/v1/me/calendar/reevaluate",
        new Blob([JSON.stringify({ year: y, month: m })], { type: "application/json" }),
      );
    } catch {
      /* 付与のみなので失敗は無視 */
    }
  }, []);

  const thumbUrl = useCallback(
    (img: { thumbnailKey: string | null; storageKey: string }) =>
      img.thumbnailKey ? `${publicUrl}/${img.thumbnailKey}` : `${publicUrl}/${img.storageKey}`,
    [publicUrl],
  );

  // 画像を1件 PATCH（①代表 or ②穴埋め）。成功で再取得。失敗はトースト。
  const patchImage = useCallback(
    async (imageId: string, body: Record<string, unknown>): Promise<boolean> => {
      setSaving(true);
      try {
        const res = await fetch(`/api/v1/images/${imageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast.error(d.error ?? "更新に失敗しました");
          return false;
        }
        return true;
      } catch {
        toast.error("更新に失敗しました");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const fetchCalendarData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/public/users/${encodeURIComponent(username)}/calendar?year=${year}&month=${month}`,
      );
      if (response.ok) {
        const json = await response.json();
        setData(json);
      }
    } catch (error) {
      console.error("Failed to fetch calendar data:", error);
    } finally {
      setLoading(false);
    }
  }, [username, year, month]);

  useEffect(() => {
    // year/month/username 変更時にサーバーからカレンダーを再取得する正当なデータフェッチ。
    // 先頭の setLoading(true) を同期 setState と見なす誤検知のため、この行のみ無効化する。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCalendarData();
  }, [fetchCalendarData]);

  // 編集モードの ON/OFF。OFF に切り替える瞬間にその月の皆勤賞を再判定（付与のみ）。
  const toggleEditMode = useCallback(async () => {
    if (editMode) {
      setPicker(null);
      try {
        await fetch("/api/v1/me/calendar/reevaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year, month }),
        });
      } catch {
        /* 再判定は付与のみなので失敗しても致命的でない */
      }
      setEditMode(false);
      await fetchCalendarData();
      router.refresh();
    } else {
      setEditMode(true);
      // レイアウトを動かさないよう、操作説明はトーストで案内する。
      toast("日付をタップすると、サムネイル選択や穴埋め割り当ての変更ができます。", {
        duration: 10000,
      });
    }
  }, [editMode, year, month, fetchCalendarData, router]);

  // 編集中のタブ離脱（閉じる/リロード/ハードナビ/バックグラウンド化）で再判定を投げ切る。
  // モバイル Safari では beforeunload が不安定なため pagehide と visibilitychange:hidden の両方で拾う。
  // 編集はすでに保存済みなのでブロッキング確認は出さない（beacon を撃つだけ）。
  useEffect(() => {
    if (!editMode) return;
    const flush = () => reevaluateBeacon(ymRef.current.year, ymRef.current.month);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [editMode, reevaluateBeacon]);

  // アプリ内遷移（ヘッダー/下部ナビ/メニュー/戻る/任意の Link）は CalendarView のアンマウントで
  // 捕まえる。編集中のまま抜けたら、離れる月の皆勤賞を beacon で再判定してから消える。
  // 依存は空配列＝この cleanup はアンマウント時のみ発火し、編集ON/OFF のトグルでは発火しない。
  useEffect(() => {
    return () => {
      if (editModeRef.current) reevaluateBeacon(ymRef.current.year, ymRef.current.month);
    };
  }, [reevaluateBeacon]);

  // PATCH 後に閉じて再取得。
  const applyAndRefresh = useCallback(
    async (imageId: string, body: Record<string, unknown>) => {
      const ok = await patchImage(imageId, body);
      if (ok) {
        setPicker(null);
        await fetchCalendarData();
      }
    },
    [patchImage, fetchCalendarData],
  );

  // URLを更新する（履歴に追加せずに置き換え）
  const updateUrl = (newYear: number, newMonth: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set("year", String(newYear));
    url.searchParams.set("month", String(newMonth));
    window.history.replaceState({}, "", url.toString());
  };

  const goToPrevMonth = () => {
    // 編集は維持したまま月をまたぐ。離れる月の皆勤賞だけ確定させる（付与のみ・冪等）。
    if (editMode) reevaluateBeacon(year, month);
    setDirection("prev");
    let newYear = year;
    let newMonth = month;
    if (month === 1) {
      newYear = year - 1;
      newMonth = 12;
    } else {
      newMonth = month - 1;
    }
    setYear(newYear);
    setMonth(newMonth);
    updateUrl(newYear, newMonth);
  };

  const goToNextMonth = () => {
    // 編集は維持したまま月をまたぐ。離れる月の皆勤賞だけ確定させる（付与のみ・冪等）。
    if (editMode) reevaluateBeacon(year, month);
    setDirection("next");
    let newYear = year;
    let newMonth = month;
    if (month === 12) {
      newYear = year + 1;
      newMonth = 1;
    } else {
      newMonth = month + 1;
    }
    setYear(newYear);
    setMonth(newMonth);
    updateUrl(newYear, newMonth);
  };

  // 見出しタップの年月ピッカーから任意の年月へジャンプ。月送りと同じく
  // 方向スライド・編集中の皆勤再判定（付与のみ・冪等）・URL更新を通す。
  const jumpToYearMonth = (newYear: number, newMonth: number) => {
    setMonthPickerOpen(false);
    if (newYear === year && newMonth === month) return;
    if (editMode) reevaluateBeacon(year, month);
    const isForward =
      newYear > year || (newYear === year && newMonth > month);
    setDirection(isForward ? "next" : "prev");
    setYear(newYear);
    setMonth(newMonth);
    updateUrl(newYear, newMonth);
  };

  // ピッカーを開くとき、パネルの表示年を現在の年に合わせる。
  const openMonthPicker = () => {
    setPickerYear(year);
    setMonthPickerOpen(true);
  };

  // カレンダーのグリッドを生成
  const generateCalendarGrid = () => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const grid: (number | null)[] = [];

    // 前月の空白セル
    for (let i = 0; i < startDayOfWeek; i++) {
      grid.push(null);
    }

    // 当月の日付
    for (let day = 1; day <= daysInMonth; day++) {
      grid.push(day);
    }

    // 6週分（42セル）になるまで埋める
    while (grid.length < 42) {
      grid.push(null);
    }

    return grid;
  };

  const grid = generateCalendarGrid();
  const today = new Date();
  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth() + 1;

  // 後日のダブル投稿で「埋まった空き日」。日→穴埋め情報のマップ（穴埋め済みセルの緑表示・遷移に使う）。
  const filledByDay = new Map<number, FilledDay>(
    (data?.perfectMonth?.filledDays ?? []).map((f) => [f.day, f]),
  );

  // 未来の月かどうか
  const isFutureMonth =
    year > today.getFullYear() ||
    (year === today.getFullYear() && month > today.getMonth() + 1);

  // この月に投稿（または穴埋め）があるか（カレンダー画像投稿ボタンの表示判定）。
  const hasPosts =
    !!data &&
    (Object.keys(data.days).length > 0 ||
      (data.perfectMonth?.filledDays.length ?? 0) > 0);

  return (
    <div className="w-full overflow-x-clip">
      {/* カレンダー本体（ナビ＋グリッド）は従来幅に制限。コンテナが広いと
          サムネイルが拡大されて粗く見えるため。凡例・説明は制限しない。 */}
      <div className="mx-auto max-w-4xl">
      {/* ナビゲーション */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={goToPrevMonth}
          disabled={loading}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <button
          type="button"
          onClick={openMonthPicker}
          disabled={loading}
          className="min-w-[120px] rounded-md px-2 py-1 text-base font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          aria-label="年月を選択"
        >
          {year}年{month}月
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={goToNextMonth}
          disabled={loading || isFutureMonth}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* 月切り替え時に「にゅーっ」と入れ替わるよう year-month をキーに remount し、
          進む/戻る方向へ fade + slide で入場させる。 */}
      <div
        key={`${year}-${month}`}
        className={cn(
          "animate-in fade-in duration-300 ease-out",
          direction === "prev"
            ? "slide-in-from-left-4"
            : direction === "next"
              ? "slide-in-from-right-4"
              : "",
        )}
      >
        {/* 穴埋め促しコールアウト（本人かつ未達成で穴埋め可能なとき） */}
        {isOwner && data?.perfectMonth && (
          <PerfectMonthCallout pm={data.perfectMonth} />
        )}

        {/* カレンダー編集＋画像投稿（owner・過去/当月のみ）。画像詳細ページのボタンUIに合わせた
            枠線ボタンを横並びで配置。編集中はカレンダー画像投稿を隠して編集ボタンのみ全幅にする。 */}
        {isOwner && !isFutureMonth && (
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={toggleEditMode}
              disabled={loading || saving}
              className={cn(
                "flex flex-auto items-center justify-center gap-1.5 h-[40px] px-1.5 border rounded-md transition-colors disabled:opacity-60",
                editMode
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground border-border",
              )}
            >
              {editMode ? (
                <>
                  <Check className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-medium">編集を終了</span>
                </>
              ) : (
                <>
                  <Pencil className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-medium">編集</span>
                </>
              )}
            </button>

            {!editMode && hasPosts && (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                disabled={loading || saving}
                className="flex flex-auto items-center justify-center gap-1.5 h-[40px] px-1.5 border rounded-md transition-colors text-muted-foreground hover:text-foreground border-border disabled:opacity-60"
              >
                <Share2 className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium">月次画像を作成</span>
              </button>
            )}
          </div>
        )}

        {/* カレンダーグリッド */}
        <div className="grid grid-cols-7 gap-1">
          {grid.map((day, index) => {
            const filled = day != null ? filledByDay.get(day) : undefined;
            // 明日以降（未来日）は編集不可。過去月は未来日なし・当月は今日より後が未来。
            const isFutureDay =
              isCurrentMonth && day != null && day > today.getDate();
            const isTodayCell = isCurrentMonth && day === today.getDate();
            // 本人の当月「今日」がまだ未投稿なら、そのセルに「＋」投稿導線を出す
            // （編集モード中は穴埋めピッカーを優先するため出さない）。
            const showAddPost =
              isOwner &&
              isTodayCell &&
              day != null &&
              !data?.days[day] &&
              !editMode &&
              !loading;
            return (
              <DayCell
                key={index}
                day={day}
                dayData={day ? data?.days[day] : undefined}
                filledMakeup={
                  filled
                    ? { filledBy: filled.filledBy, image: filled.image }
                    : undefined
                }
                publicUrl={publicUrl}
                isToday={isTodayCell}
                isSunday={index % 7 === 0}
                isSaturday={index % 7 === 6}
                isHoliday={day != null && isJapaneseHoliday(year, month, day)}
                loading={loading}
                editMode={editMode && !isFutureDay}
                showAddPost={showAddPost}
                onClick={() => {
                  // 編集モード: 日タップでピッカーを開く（代表選択 or 穴埋め割当）。
                  // 明日以降（未来日）は編集対象外。
                  if (editMode) {
                    if (day == null || isFutureDay) return;
                    setPicker({
                      kind: data?.days[day] ? "representative" : "donor",
                      day,
                    });
                    return;
                  }
                  // 本人の当日未投稿セル: 投稿ページへ遷移。
                  if (showAddPost) {
                    router.push("/create");
                    return;
                  }
                  // 戻る導線で同じ月のカレンダーへ復元できるよう from に年月を載せる。
                  const fromQ = `user-calendar:${year}-${month}`;
                  if (day && data?.days[day]) {
                    router.push(
                      `/u/${username}/status/${data.days[day].latest.id}?from=${fromQ}`,
                    );
                  } else if (filled) {
                    // 穴埋め済みセルは「埋めた日の2枚目の写真」へ遷移
                    router.push(
                      `/u/${username}/status/${filled.image.id}?from=${fromQ}`,
                    );
                  }
                }}
              />
            );
          })}
        </div>

        {/* 皆勤賞達成バナー（達成月のみ・閲覧者全員に表示・カレンダーの下） */}
        {data?.perfectMonth?.achieved && <PerfectMonthBanner />}
      </div>
      </div>

      {/* 凡例＋穴埋め制度の説明 */}
      <div className="mt-4 space-y-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">
        <p className="flex items-center gap-1.5 font-semibold text-foreground">
          <Crown className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500" />
          皆勤賞を目指しませんか？
        </p>
        <p>
          1ヶ月間毎日投稿すれば、カレンダーが埋まって皆勤賞の称号が得られます。皆勤賞はSHAMEZOにおける最高の栄誉です。
        </p>
        <p>
          もし投稿を忘れてしまっても大丈夫。同じ月の後日に1日2枚以上投稿すれば、2枚目の投稿が投稿を忘れた日の投稿を&ldquo;穴埋め&rdquo;できます。ただし、穴埋めのための投稿は1日につき1回まで・月につき
          {grace > PERFECT_MONTH_GRACE_DEFAULT ? (
            <>
              <span className="mx-0.5 font-bold text-muted-foreground/70 line-through">
                {PERFECT_MONTH_GRACE_DEFAULT}
              </span>
              <span className="mx-0.5 text-base font-extrabold text-foreground">
                {grace}
              </span>
              回まで。
              <span className="font-semibold text-foreground">
                {/* 特典（FAVOR_SERVERS）が効いている＝持ち主の所属サーバーが特典対象 */}
                ※{serverName} ユーザー限定特典で条件緩和中！
              </span>
            </>
          ) : (
            `${grace}回まで。`
          )}
        </p>

        {/* マーカーの凡例 */}
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <StackedSquaresIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.5} />
            <span>2枚以上投稿した日</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-500/90 text-[8px] font-bold leading-none text-white ring-1 ring-black/15">
              埋
            </span>
            <span>穴埋めされた日</span>
          </div>
        </div>
      </div>

      {/* 編集モードのピッカー（代表選択 / 穴埋め割当） */}
      {picker && data?.ownerEdit && (
        <EditPicker
          picker={picker}
          year={year}
          month={month}
          dayImages={data.ownerEdit.dayImages}
          filledByDay={filledByDay}
          thumbUrl={thumbUrl}
          saving={saving}
          onClose={() => setPicker(null)}
          onApply={applyAndRefresh}
        />
      )}

      {/* カレンダー画像（コラージュ）の共有ダイアログ */}
      {shareOpen && (
        <CollageShareDialog
          year={year}
          month={month}
          serverName={serverName}
          instanceType={instanceType}
          onClose={() => setShareOpen(false)}
        />
      )}

      {/* 年月ジャンプのピッカー（見出しタップで開く） */}
      {monthPickerOpen && (
        <MonthYearPicker
          selectedYear={year}
          selectedMonth={month}
          pickerYear={pickerYear}
          setPickerYear={setPickerYear}
          today={today}
          onClose={() => setMonthPickerOpen(false)}
          onPick={jumpToYearMonth}
        />
      )}
    </div>
  );
}

/** 見出しタップで開く年月ジャンプ用ボトムシート。年を送りながら12ヶ月から選ぶ。 */
function MonthYearPicker({
  selectedYear,
  selectedMonth,
  pickerYear,
  setPickerYear,
  today,
  onClose,
  onPick,
}: {
  selectedYear: number;
  selectedMonth: number;
  pickerYear: number;
  setPickerYear: (y: number) => void;
  today: Date;
  onClose: () => void;
  onPick: (year: number, month: number) => void;
}) {
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  // 未来年へは進めない（当年まで）。
  const canGoNextYear = pickerYear < todayYear;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-background p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 年セレクタ */}
        <div className="mb-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setPickerYear(pickerYear - 1)}
            aria-label="前の年"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-base font-bold">{pickerYear}年</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setPickerYear(pickerYear + 1)}
            disabled={!canGoNextYear}
            aria-label="次の年"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* 12ヶ月グリッド（未来月は選択不可） */}
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const isFuture =
              pickerYear > todayYear ||
              (pickerYear === todayYear && m > todayMonth);
            const isSelected = pickerYear === selectedYear && m === selectedMonth;
            return (
              <button
                key={m}
                type="button"
                disabled={isFuture}
                onClick={() => onPick(pickerYear, m)}
                className={cn(
                  "rounded-md py-2 text-sm font-semibold transition-colors",
                  isFuture
                    ? "cursor-not-allowed text-muted-foreground/40"
                    : isSelected
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                )}
              >
                {m}月
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 編集モードのボトムシート型ピッカー。代表サムネ選択と穴埋め割当を1つで扱う。 */
function EditPicker({
  picker,
  year,
  month,
  dayImages,
  filledByDay,
  thumbUrl,
  saving,
  onClose,
  onApply,
}: {
  picker: { kind: "representative" | "donor"; day: number };
  year: number;
  month: number;
  dayImages: Record<number, OwnerDayImage[]>;
  filledByDay: Map<number, FilledDay>;
  thumbUrl: (img: { thumbnailKey: string | null; storageKey: string }) => string;
  saving: boolean;
  onClose: () => void;
  onApply: (imageId: string, body: Record<string, unknown>) => void;
}) {
  const { kind, day } = picker;

  // カレンダーと同じ曜日色（日/祝=赤・土=青）でその日の番号を表示するためのヘルパー。
  const dayNumberClass = (d: number): string => {
    const dow = new Date(year, month - 1, d).getDay();
    const isRed = dow === 0 || isJapaneseHoliday(year, month, d);
    const isBlue = dow === 6 && !isRed;
    return isRed ? "text-red-400" : isBlue ? "text-blue-400" : "text-white";
  };

  // 穴埋め割当の候補: その穴より後の「2枚以上投稿した日」の画像を全て表示し、
  // 選べないもの（＝その日のサムネイル／別の穴で使用中）はグレーアウトして見せる。
  const donorCandidates: {
    day: number;
    img: OwnerDayImage;
    disabled: boolean;
    isCurrent: boolean;
    reason: string | null;
  }[] = [];
  if (kind === "donor") {
    for (const [dStr, imgs] of Object.entries(dayImages)) {
      const d = Number(dStr);
      if (d > day && imgs.length >= 2) {
        for (const img of imgs) {
          const isCurrent = img.makeupTargetDay === day;
          const usedElsewhere = img.makeupTargetDay != null && !isCurrent;
          const disabled = img.isPicked || usedElsewhere;
          // 選べない理由（タップ時のトーストで案内する）
          const reason = img.isPicked
            ? "この写真はその日のサムネイルに使用中のため、穴埋めには使えません"
            : usedElsewhere
              ? `この写真は${img.makeupTargetDay}日の穴埋めに使用中のため、この日には使えません`
              : null;
          donorCandidates.push({ day: d, img, disabled, isCurrent, reason });
        }
      }
    }
    donorCandidates.sort((a, b) => a.day - b.day);
  }
  const currentFill = kind === "donor" ? filledByDay.get(day) : undefined;
  const repImages = kind === "representative" ? (dayImages[day] ?? []) : [];
  const pickedRep = repImages.find((i) => i.isPicked);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-background p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold">
            {kind === "representative"
              ? `${month}月${day}日のサムネイルを選ぶ`
              : `${month}月${day}日を穴埋めする写真を選ぶ`}
          </h3>
          <button onClick={onClose} className="-m-1.5 rounded p-2.5 text-muted-foreground hover:bg-muted" aria-label="閉じる">
            <X className="h-4 w-4" />
          </button>
        </div>

        {kind === "representative" && (
          <div className="grid grid-cols-4 gap-2">
            {repImages.map((img) => {
              // 穴埋めに使っている写真はサムネイルにできない → 表示するが選べない（グレーアウト）。
              const isDonor = img.makeupTargetDay != null;
              return (
                <button
                  key={img.id}
                  disabled={saving}
                  onClick={() => {
                    // 穴埋めに使用中の写真はサムネイルにできない → タップでトースト案内。
                    if (isDonor) {
                      toast.error(
                        `この写真は${img.makeupTargetDay}日の穴埋めに使用中のため、サムネイルにできません`,
                      );
                      return;
                    }
                    onApply(img.id, { calendarPicked: true });
                  }}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded ring-offset-2",
                    isDonor
                      ? "opacity-40"
                      : img.isPicked
                        ? "ring-2 ring-amber-500"
                        : "hover:ring-2 hover:ring-primary",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbUrl(img)} alt="" className="h-full w-full object-cover" />
                  {img.isPicked && !isDonor && (
                    <span className="absolute right-0.5 top-0.5 rounded-full bg-amber-500 p-0.5 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  {isDonor && (
                    <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[10px] font-semibold text-white/90">
                      使用中
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {kind === "representative" && pickedRep && (
          <button
            disabled={saving}
            onClick={() => onApply(pickedRep.id, { calendarPicked: false })}
            className="mt-3 w-full rounded-md border py-2 text-xs text-muted-foreground hover:bg-muted"
          >
            自動（その日の最初の投稿）に戻す
          </button>
        )}

        {kind === "donor" && (
          <>
            {donorCandidates.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                この日を埋められる候補（後日の2枚以上投稿）がありません
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {donorCandidates.map(({ day: d, img, disabled, isCurrent, reason }) => (
                  <button
                    key={img.id}
                    disabled={saving}
                    onClick={() => {
                      // 使用中で選べないものはタップでトースト案内（適用しない）。
                      if (disabled) {
                        toast.error(reason ?? "この写真は使用中のため選べません");
                        return;
                      }
                      onApply(img.id, { makeupTargetDay: day });
                    }}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded",
                      disabled
                        ? "opacity-40"
                        : isCurrent
                          ? "ring-2 ring-emerald-500"
                          : "hover:ring-2 hover:ring-primary",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumbUrl(img)} alt="" className="h-full w-full object-cover" />
                    {/* ラベルはカレンダーと同じ「日付のみ（曜日色）」に統一。使用中は「使用中」に簡略化。 */}
                    <span
                      className={cn(
                        "absolute bottom-0 left-0 right-0 bg-black/60 text-center text-[10px] font-semibold",
                        disabled ? "text-white/90" : dayNumberClass(d),
                      )}
                    >
                      {disabled ? "使用中" : d}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {currentFill && (
              <button
                disabled={saving}
                onClick={() => onApply(currentFill.image.id, { makeupTargetDay: null })}
                className="mt-3 w-full rounded-md border py-2 text-xs text-red-600 hover:bg-muted"
              >
                穴埋めを解除する
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
