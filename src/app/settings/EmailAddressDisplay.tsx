"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmailAddressDisplayProps {
  emailPrefix: string;
  emailDomain: string;
}

export function EmailAddressDisplay({ emailPrefix: initialEmailPrefix, emailDomain }: EmailAddressDisplayProps) {
  const [currentEmailPrefix, setCurrentEmailPrefix] = useState(initialEmailPrefix);
  const [isVisible, setIsVisible] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

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

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullEmail);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      <div>
        <dt className="text-sm font-medium text-muted-foreground">投稿用メールアドレス</dt>
        <dd className="mt-1 flex items-start gap-2">
          <code className="bg-background px-2 py-1 rounded text-sm">
            {isVisible ? (
              <>
                <span className="block">{currentEmailPrefix}</span>
                <span className="block">@{emailDomain}</span>
              </>
            ) : (
              <>
                <span className="block blur-sm select-none" aria-hidden="true">{currentEmailPrefix}</span>
                <span className="block blur-sm select-none" aria-hidden="true">@{emailDomain}</span>
              </>
            )}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="コピー"
          >
            {isCopied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
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
