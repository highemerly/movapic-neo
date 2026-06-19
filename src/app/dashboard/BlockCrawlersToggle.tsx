"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SaveStatus, type SaveStatusState } from "@/components/ui/save-status";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

interface BlockCrawlersToggleProps {
  initialEnabled: boolean;
}

type SaveState = SaveStatusState;

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
        body: JSON.stringify({ blockCrawlers: next }),
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
            クローラーのアクセスを拒否する
            <SaveStatus state={saveState} error={error} />
          </p>
          <p className="text-xs text-muted-foreground">
            検索エンジン・AIなどに対し、あなたのページを登録しないよう要望します。設定の反映には時間がかかります。また、要望を無視するクローラーには効果がありません。
          </p>
        </div>
        <ToggleSwitch checked={enabled} onChange={handleToggle} disabled={isSaving} />
      </label>
    </div>
  );
}
