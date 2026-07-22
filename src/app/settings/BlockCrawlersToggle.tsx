"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toastSaved, toastSettingsError } from "./settingsToast";
import { SettingToggleRow } from "@/components/SettingRow";
import { parseApiError, formatErrorMessage } from "@/lib/errors";

interface BlockCrawlersToggleProps {
  initialEnabled: boolean;
}

/**
 * 検索エンジン/AI Botのクロール拒否トグル。
 * ON → 自分のユーザーページ（/u/[username] 配下）を検索エンジンに noindex し、
 *       AI/LLM 系クローラーを robots.txt で Disallow する。
 * OFF（デフォルト） → 従来どおりクロール・インデックスを許可。
 * 反映: 検索エンジンの noindex は次回クロール時、robots.txt は保存時に即反映。
 */
export function BlockCrawlersToggle({ initialEnabled }: BlockCrawlersToggleProps) {
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
        body: JSON.stringify({ blockCrawlers: next }),
      });
      if (!res.ok) {
        setEnabled(!next); // ロールバック
        throw new Error(formatErrorMessage(await parseApiError(res)));
      }
      toastSaved("settings-blockcrawlers");
      router.refresh();
    } catch (err) {
      toastSettingsError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingToggleRow
      title="クローラーのアクセスを拒否する"
      description="検索エンジン・AIエージェントに、あなたのページを利用しないよう要望します。反映には時間がかかり、要望を無視するクローラーには効果がありません。"
      checked={enabled}
      onChange={handleToggle}
      disabled={isSaving}
    />
  );
}
