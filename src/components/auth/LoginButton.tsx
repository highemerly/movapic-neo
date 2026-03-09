"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LoginButtonProps {
  /**
   * 許可されたサーバーリスト
   * 単一サーバーの場合: サーバー入力欄を非表示にしてワンクリックログイン
   * 複数サーバーの場合: サーバー選択UI（将来実装）
   * undefinedの場合: 自由入力
   */
  allowedServers?: string[];
}

export function LoginButton({ allowedServers }: LoginButtonProps) {
  const [server, setServer] = useState(
    allowedServers?.length === 1 ? allowedServers[0] : ""
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 単一サーバー限定モード
  const singleServerMode = allowedServers?.length === 1;

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const targetServer = singleServerMode ? allowedServers[0] : server.trim();

    if (!targetServer) {
      setError("サーバー名を入力してください");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/fediverse/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          server: targetServer,
          callbackUrl: "/create",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "認証の開始に失敗しました");
      }

      window.location.href = data.url;
    } catch (err) {
      console.error("Login error:", err);
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setIsLoading(false);
    }
  };

  // 単一サーバー限定モード: シンプルなボタン
  if (singleServerMode) {
    return (
      <div className="space-y-2">
        <Button
          onClick={() => handleLogin()}
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? "処理中..." : `${allowedServers[0]} でログイン`}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // 自由入力モード
  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <div className="flex gap-2">
        <Input
          type="text"
          value={server}
          onChange={(e) => setServer(e.target.value)}
          placeholder="mastodon.social"
          disabled={isLoading}
          className="flex-1"
        />
        <Button type="submit" disabled={isLoading || !server.trim()}>
          {isLoading ? "処理中..." : "ログイン"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Mastodon または Misskey サーバーのドメインを入力してください
      </p>
    </form>
  );
}
