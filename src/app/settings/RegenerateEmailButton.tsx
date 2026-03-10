"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface RegenerateEmailButtonProps {
  emailDomain: string;
}

export function RegenerateEmailButton({ emailDomain }: RegenerateEmailButtonProps) {
  const router = useRouter();
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleRegenerate = async () => {
    const confirmed = confirm(
      `投稿用メールアドレスを再生成しますか？\n\n` +
      `【注意】\n` +
      `・現在のメールアドレスは二度と使用できなくなります\n` +
      `・元のアドレスに戻すことはできません\n` +
      `・メールクライアントの設定変更が必要になります\n\n` +
      `本当に再生成しますか？`
    );

    if (!confirmed) {
      return;
    }

    // 二重確認
    const doubleConfirmed = confirm(
      `最終確認です。\n\n` +
      `現在の投稿用メールアドレスは完全に無効になり、\n` +
      `絶対に元には戻せません。\n\n` +
      `再生成を実行しますか？`
    );

    if (!doubleConfirmed) {
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

      const data = await response.json();
      alert(`新しいメールアドレス:\n${data.emailPrefix}@${emailDomain}`);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "再生成に失敗しました");
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-background">
      <p className="text-xs text-muted-foreground mb-2">
        メールアドレスを変更したい場合は再生成できます。
        <span className="text-destructive font-medium">
          再生成すると元のアドレスは使用できなくなり、元に戻すことはできません。
        </span>
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={handleRegenerate}
        disabled={isRegenerating}
      >
        {isRegenerating ? "再生成中..." : "メールアドレスを再生成"}
      </Button>
    </div>
  );
}
