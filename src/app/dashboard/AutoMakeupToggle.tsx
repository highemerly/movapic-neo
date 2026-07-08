"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SaveStatus, type SaveStatusState } from "@/components/ui/save-status";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

interface AutoMakeupToggleProps {
  /** 「自動穴埋めをしない」が有効か（＝autoMakeup=false）。デフォルトは false（＝自動穴埋めする）。 */
  initialDisabled: boolean;
}

type SaveState = SaveStatusState;

/**
 * カレンダーの自動穴埋めを「しない」設定トグル。
 * OFF（デフォルト） → 投稿の瞬間に、1日2枚以上投稿（ダブル投稿）した分で過去の未投稿日を自動的に穴埋めする。
 * ON（自動穴埋めをしない） → 自動では穴埋めせず、カレンダーの編集モードで明示的に指定した穴だけを埋める。
 * ※過去に確定した穴埋めや皆勤賞には影響しない（未来の投稿の自動割当だけを切り替える）。
 * DBの User.autoMakeup（既定true）に対し、このトグルは「しない＝autoMakeup:false」を送る反転UI。
 */
export function AutoMakeupToggle({ initialDisabled }: AutoMakeupToggleProps) {
  const router = useRouter();
  // enabled = 「自動穴埋めをしない」が有効か
  const [enabled, setEnabled] = useState(initialDisabled);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const savedClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSaving = saveState === "saving";

  const handleToggle = async () => {
    const next = !enabled; // 「しない」の新しい状態
    setEnabled(next);
    setSaveState("saving");
    setError(null);
    try {
      const res = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // 「しない」がON → autoMakeup=false
        body: JSON.stringify({ autoMakeup: !next }),
      });
      if (!res.ok) {
        setEnabled(!next); // ロールバック
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "保存に失敗しました");
      }
      setSaveState("saved");
      router.refresh();
      if (savedClearRef.current) clearTimeout(savedClearRef.current);
      savedClearRef.current = setTimeout(() => setSaveState("idle"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setSaveState("error");
    }
  };

  return (
    <div>
      <label className="flex items-center justify-between gap-4 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
        <div className="flex-1 min-w-0">
          <p className="text-sm flex items-center flex-wrap gap-x-2">
            カレンダーの自動穴埋めをしない
            <SaveStatus state={saveState} error={error} />
          </p>
          <p className="text-xs text-muted-foreground">
            投稿を忘れたとき、1日に2枚以上投稿しても、未投稿日を穴埋めしません。
          </p>
        </div>
        <ToggleSwitch checked={enabled} onChange={handleToggle} disabled={isSaving} />
      </label>
    </div>
  );
}
