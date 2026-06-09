"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function EmailPrefixRegenerate() {
  const router = useRouter();
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleRegenerate = async () => {
    const confirmed = confirm(
      `投稿用メールアドレスを再生成しますか？\n\n` +
      `【注意】\n` +
      `・現在のメールアドレスは二度と使用できなくなります\n` +
      `・元のアドレスに戻すことはできません\n` +
      `・メールクライアントの設定変更が必要になります`
    );

    if (!confirmed) {
      return;
    }

    setIsRegenerating(true);
    try {
      const response = await fetch("/api/v1/me/email-prefix", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "再生成に失敗しました");
      }

      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "再生成に失敗しました");
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleRegenerate}
      disabled={isRegenerating}
      className="w-full flex items-center justify-between gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left disabled:opacity-60"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm">投稿用メールアドレスを再生成する</p>
        <p className="text-xs text-muted-foreground">
          現在のアドレスは無効になり、新しいアドレスが発行されます。
        </p>
      </div>
      <RefreshCw
        className={`h-4 w-4 flex-shrink-0 text-muted-foreground ${isRegenerating ? "animate-spin" : ""}`}
      />
    </button>
  );
}
