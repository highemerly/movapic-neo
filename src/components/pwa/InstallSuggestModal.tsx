"use client";

import { useCallback, useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";
import { usePwaInstallState } from "@/hooks/usePwaInstallState";
import { triggerInstall } from "@/lib/pwa/install";
import {
  shouldSuggestInstall,
  afterDismiss,
  loadSuggestState,
  saveSuggestState,
} from "@/lib/pwa/suggest";
import { IosInstallSteps } from "./IosInstallSteps";

/** 完了トーストと重ならないよう、少し遅らせて出す。 */
const APPEAR_DELAY_MS = 1200;

// 同じセッション（リロードまで）では一度しか出さない。閉じずに離脱した場合に
// 猶予が記録されないため、そのままだと次の投稿でまた出てしまう。
let shownThisSession = false;

/**
 * 投稿完了直後（画像詳細 ?posted=1）に出す、ホーム画面追加のおすすめモーダル。
 *
 * 実績を獲得した投稿では出さない（[AchievementCelebration] の fallback として描画され、
 * 実績があるときはそもそもマウントされない）。表示条件と頻度制御は [suggest.ts] に集約。
 */
export function InstallSuggestModal() {
  const { platform, standalone, canInstall } = usePwaInstallState();
  const [closed, setClosed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  // localStorage / Date.now() は描画中に読めない（純粋性）ため、遅延タイマーの発火時にまとめて判定する。
  // canInstall は beforeinstallprompt の到着で後から true になり得るので、そのたびに測り直す。
  useEffect(() => {
    if (shownThisSession) return;
    const timer = setTimeout(() => {
      const ok = shouldSuggestInstall({
        platform,
        standalone,
        canInstall,
        // このコンポーネントはサーバー側の前提（本人＋2投稿目以降）を満たすときだけ描画される
        eligiblePost: true,
        state: loadSuggestState(),
        now: Date.now(),
      });
      if (!ok) return;
      shownThisSession = true;
      setVisible(true);
    }, APPEAR_DELAY_MS);
    return () => clearTimeout(timer);
  }, [platform, standalone, canInstall]);

  // 閉じる操作（背景タップ / Esc / 「いいえ、結構です」）は等しく「断られた」として猶予を伸ばす
  const dismiss = useCallback(() => {
    saveSuggestState(afterDismiss(loadSuggestState(), Date.now()));
    setClosed(true);
  }, []);

  useEffect(() => {
    if (!visible || closed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, closed, dismiss]);

  if (!visible || closed) return null;

  const isIos = platform === "ios-safari";

  const handleInstall = async () => {
    setBusy(true);
    const result = await triggerInstall();
    setBusy(false);
    if (result === "accepted") {
      // 以後は standalone 判定で対象外になるため猶予は記録しない
      setClosed(true);
      return;
    }
    if (result === "unavailable") {
      toast.error("この端末では今すぐインストールできません");
    }
    dismiss();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-label="ホーム画面に追加"
    >
      <div
        className="animate-celebrate-in relative max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl border bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
            <Smartphone className="h-6 w-6" />
          </span>
          <p className="mt-3 text-base font-bold">
            SHAMEZOをホーム画面に追加しませんか？
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {isIos
              ? "アプリのように投稿・閲覧できます。"
              : "アプリのように投稿・閲覧したり、他アプリからも共有メニューを使って投稿できます。"}
          </p>
        </div>

        {isIos && (
          <div className="mt-5">
            <IosInstallSteps compact />
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {!isIos && (
            <button
              type="button"
              onClick={handleInstall}
              disabled={busy}
              className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-brand-foreground transition-colors hover:bg-brand/90 disabled:opacity-60"
            >
              インストールする
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            いいえ、結構です
          </button>
        </div>
      </div>
    </div>
  );
}
