"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Button } from "@/components/ui/button";
import { EmailAddressDisplay } from "@/components/post-methods/EmailAddressDisplay";
import { SETTINGS_TOAST_DURATION } from "./settingsToast";

interface EmailPrefixRegenerateProps {
  emailPrefix: string;
  emailDomain: string;
}

/**
 * 投稿用メールアドレスの確認（既定はぼかし・表示/コピー可能な EmailAddressDisplay を再利用）と、
 * その再生成をまとめたフィールド。再生成は不可逆なため confirm で警告してから実行する。
 */
export function EmailPrefixRegenerate({ emailPrefix, emailDomain }: EmailPrefixRegenerateProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleRegenerate = async () => {
    const confirmed = await confirm({
      title: "投稿用メールアドレスを再生成",
      description:
        `【注意】\n` +
        `・現在のメールアドレスは二度と使用できなくなります\n` +
        `・元のアドレスに戻すことはできません\n` +
        `・メールクライアントの設定変更が必要になります`,
      confirmText: "再生成する",
      destructive: true,
    });

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

      toast.success("投稿用メールアドレスを再生成しました", { duration: SETTINGS_TOAST_DURATION });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "再生成に失敗しました", { duration: SETTINGS_TOAST_DURATION });
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    // 「初期設定を保存する」と同じ 1枠＋区切り線パターン: 上=アドレス確認 / 下=再生成
    <div className="rounded-lg border">
      <div className="space-y-2 p-3">
        <div>
          <p className="text-sm">投稿用メールアドレス</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            コメントを本文に、画像を添付してこのアドレス宛に送ると、投稿できます。第三者に知られないようご注意ください。
          </p>
        </div>
        <ul className="list-none text-sm">
          <EmailAddressDisplay emailPrefix={emailPrefix} emailDomain={emailDomain} label="" />
        </ul>
      </div>
      {/* 不可逆な操作なので destructive 色のアウトラインボタンで警告 */}
      <div className="border-t p-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRegenerating ? "animate-spin" : ""}`} />
          メールアドレスを再生成する
        </Button>
      </div>
    </div>
  );
}
