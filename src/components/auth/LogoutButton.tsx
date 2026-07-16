"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/providers/ConfirmProvider";

interface LogoutButtonProps {
  className?: string;
  variant?: "destructive" | "ghost" | "outline";
}

export function LogoutButton({ className, variant = "destructive" }: LogoutButtonProps) {
  const confirm = useConfirm();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    // 誤タップでの意図しないログアウトを防ぐため、必ず確認モーダルを挟む（サイドメニューと同挙動）。
    if (
      !(await confirm({
        title: "ログアウト",
        description: "ログアウトします。よろしいですか？",
        confirmText: "ログアウト",
        destructive: true,
      }))
    ) {
      return;
    }
    setIsLoading(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
      // トップ着地時に「ログアウトしました」トーストを出すため sessionStorage に合図を積む（SessionFlasher が読んで即削除）。
      sessionStorage.setItem(
        "flash:loggedOut",
        JSON.stringify({ variant: "success", message: "ログアウトしました" }),
      );
      window.location.href = "/";
    } catch (error) {
      console.error("Logout error:", error);
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size="sm"
      onClick={handleLogout}
      disabled={isLoading}
      className={className}
    >
      {isLoading ? "処理中..." : "ログアウト"}
    </Button>
  );
}
