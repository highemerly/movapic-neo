"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

interface LocationMapToggleProps {
  initialEnabled: boolean;
  username: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * 地図機能（ベータ）の公開オプトイントグル。
 * ON → ユーザーページに「地図」タブが他人にも表示され、都道府県別投稿数が公開される。
 * OFF（デフォルト） → 本人にしか地図が見えない。
 */
export function LocationMapToggle({ initialEnabled, username }: LocationMapToggleProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const savedClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSaving = saveState === "saving";

  const handleToggle = async () => {
    const next = !enabled;
    setEnabled(next);
    setSaveState("saving");
    setError(null);
    try {
      const res = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showLocationMap: next }),
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
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center justify-between gap-4 p-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm">
            地図を公開する
            <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              BETA
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            ユーザーページに「地図」タブを表示し、都道府県別の投稿数を他のユーザーにも公開します。投稿時に位置情報を含めた画像のみが集計対象です。
          </p>
          {enabled && (
            <a
              href={`/u/${username}/map`}
              className="mt-1 inline-block text-xs text-primary hover:underline"
            >
              → 自分の地図を確認する
            </a>
          )}
        </div>
        <div
          className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${
            enabled ? "bg-primary" : "bg-muted"
          } ${isSaving ? "opacity-60" : ""}`}
        >
          <div
            className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </div>
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleToggle}
          disabled={isSaving}
          className="sr-only"
        />
      </label>
      <div className="flex items-center gap-2 px-3 text-xs min-h-4">
        {saveState === "saving" && (
          <>
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">保存中...</span>
          </>
        )}
        {saveState === "saved" && (
          <>
            <Check className="h-3 w-3 text-green-600" />
            <span className="text-green-600">保存しました</span>
          </>
        )}
        {saveState === "error" && error && (
          <span className="text-destructive">{error}</span>
        )}
      </div>
    </div>
  );
}
