"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface EmailAddressDisplayProps {
  emailPrefix: string;
  emailDomain: string;
}

export function EmailAddressDisplay({ emailPrefix: initialEmailPrefix, emailDomain }: EmailAddressDisplayProps) {
  const [currentEmailPrefix, setCurrentEmailPrefix] = useState(initialEmailPrefix);
  const [isVisible, setIsVisible] = useState(false);
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

      const data = await response.json();
      setCurrentEmailPrefix(data.emailPrefix);
      setIsVisible(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "再生成に失敗しました");
    } finally {
      setIsRegenerating(false);
    }
  };

  const fullEmail = `${currentEmailPrefix}@${emailDomain}`;

  return (
    <div className="space-y-3">
      <div>
        <dt className="text-sm font-medium text-muted-foreground">投稿用メールアドレス</dt>
        <dd className="mt-1">
          <code className="bg-background px-2 py-1 rounded text-sm">
            {isVisible ? (
              fullEmail
            ) : (
              <span className="blur-sm select-none" aria-hidden="true">
                {fullEmail}
              </span>
            )}
          </code>
        </dd>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsVisible(!isVisible)}
        >
          {isVisible ? "隠す" : "表示"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRegenerate}
          disabled={isRegenerating}
        >
          {isRegenerating ? "再生成中..." : "再生成"}
        </Button>
      </div>
    </div>
  );
}
