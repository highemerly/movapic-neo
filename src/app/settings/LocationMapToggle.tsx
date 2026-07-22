"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toastSaved, toastSettingsError } from "./settingsToast";
import { SettingToggleRow } from "@/components/SettingRow";
import { parseApiError, formatErrorMessage } from "@/lib/errors";

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
        throw new Error(formatErrorMessage(await parseApiError(res)));
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
    <SettingToggleRow
      title="地図を公開する"
      description={
        <>
          都道府県別の投稿数をユーザーページに表示します（位置情報を明示的に含めた画像のみが集計対象）。
          {enabled && (
            <a
              href={`/u/${username}/map`}
              className="mt-1 inline-block text-primary hover:underline"
            >
              → 自分の地図を確認する
            </a>
          )}
        </>
      }
      checked={enabled}
      onChange={handleToggle}
      disabled={isSaving}
    />
  );
}
