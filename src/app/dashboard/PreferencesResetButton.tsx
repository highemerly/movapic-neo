"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function PreferencesResetButton() {
  const router = useRouter();
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    const confirmed = confirm(
      "デフォルト設定をリセットしますか？\n\n" +
      "リセットするとシステム標準の設定が使用されます。"
    );

    if (!confirmed) {
      return;
    }

    setIsResetting(true);
    try {
      const response = await fetch("/api/v1/me/preferences", {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "リセットに失敗しました");
      }

      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "リセットに失敗しました");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleReset}
      disabled={isResetting}
    >
      {isResetting ? "リセット中..." : "設定をリセット"}
    </Button>
  );
}
