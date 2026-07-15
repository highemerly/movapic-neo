"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toastSaved, toastSettingsError } from "./settingsToast";
import { SettingToggleRow } from "@/components/SettingRow";

interface AutoMakeupToggleProps {
  /** 自動穴埋めが有効か（＝ User.autoMakeup。既定 true）。 */
  initialEnabled: boolean;
}

/**
 * カレンダーの自動穴埋め設定トグル（肯定形＝ONで穴埋めする）。
 * ON（デフォルト） → 投稿の瞬間に、1日2枚以上投稿（ダブル投稿）した分で過去の未投稿日を自動的に穴埋めする。
 * OFF → 自動では穴埋めせず、カレンダーの編集モードで明示的に指定した穴だけを埋める。
 * ※過去に確定した穴埋めや皆勤賞には影響しない（未来の投稿の自動割当だけを切り替える）。
 * DB の User.autoMakeup（既定 true）をそのまま送る（以前の「しない」反転UIは二重否定で分かりづらいため肯定形に変更）。
 */
export function AutoMakeupToggle({ initialEnabled }: AutoMakeupToggleProps) {
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
        body: JSON.stringify({ autoMakeup: next }),
      });
      if (!res.ok) {
        setEnabled(!next); // ロールバック
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "保存に失敗しました");
      }
      toastSaved("settings-automakeup");
      router.refresh();
    } catch (err) {
      toastSettingsError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingToggleRow
      title="カレンダーを自動で穴埋めする"
      description="1日に2枚以上投稿したとき、余った分で過去の未投稿日を自動的に埋めます。"
      checked={enabled}
      onChange={handleToggle}
      disabled={isSaving}
    />
  );
}
