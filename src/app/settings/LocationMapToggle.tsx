"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toastSaved, toastSettingsError } from "./settingsToast";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

interface LocationMapToggleProps {
  initialEnabled: boolean;
  username: string;
}

/**
 * 地図機能の公開オプトイントグル。
 * ON → ユーザーページに「地図」タブが他人にも表示され、都道府県別投稿数が公開される。
 * OFF（デフォルト） → 本人を含め地図は表示されない（非公開）。
 */
export function LocationMapToggle({ initialEnabled, username }: LocationMapToggleProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = async () => {
    const next = !enabled;
    setEnabled(next);
    setIsSaving(true);
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
      toastSaved("settings-locationmap");
      router.refresh();
    } catch (err) {
      toastSettingsError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <label className="flex items-center justify-between gap-4 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
        <div className="flex-1 min-w-0">
          <p className="text-sm">地図を有効にする</p>
          <p className="text-xs text-muted-foreground">
            都道府県別の投稿数をユーザーページに表示します（投稿時に位置情報を明示的に含めた画像のみが集計対象です）。
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
        <ToggleSwitch checked={enabled} onChange={handleToggle} disabled={isSaving} />
      </label>
    </div>
  );
}
