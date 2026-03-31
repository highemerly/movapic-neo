"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

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
  const router = useRouter();
  const [server, setServer] = useState(
    allowedServers?.length === 1 ? allowedServers[0] : ""
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [agreed, setAgreed] = useState(false);

  // 単一サーバー限定モード
  const singleServerMode = allowedServers?.length === 1;

  // ログイン状態をチェック
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/v1/me");
        setIsLoggedIn(response.ok);
      } catch {
        setIsLoggedIn(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();

    // ログイン済みの場合はダッシュボードへ
    if (isLoggedIn) {
      router.push("/dashboard");
      return;
    }

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
          callbackUrl: "/dashboard",
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

  const agreementCheckbox = (
    <div className="flex items-start gap-2">
      <Checkbox
        id="agree"
        checked={agreed}
        onCheckedChange={(checked) => setAgreed(checked === true)}
        className="mt-0.5"
      />
      <label htmlFor="agree" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
        <Link href="/terms" className="underline hover:text-foreground">利用規約</Link>
        {" "}および{" "}
        <Link href="/privacy" className="underline hover:text-foreground">プライバシーポリシー</Link>
        に同意してログインします
      </label>
    </div>
  );

  // 単一サーバー限定モード: シンプルなボタン
  if (singleServerMode) {
    const buttonLabel = isLoggedIn
      ? "ダッシュボードへ"
      : isLoading
        ? "処理中..."
        : `${allowedServers[0]} でログイン`;

    return (
      <div className="space-y-4">
        {!isLoggedIn && agreementCheckbox}
        <Button
          onClick={() => handleLogin()}
          disabled={isLoading || isLoggedIn === null || (!isLoggedIn && !agreed)}
          className="w-full py-6 text-lg"
          size="lg"
        >
          {isLoggedIn === null ? "読み込み中..." : buttonLabel}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!isLoggedIn && (
          <p className="text-xs text-muted-foreground">
            他のサーバーでは現在利用できません
          </p>
        )}
      </div>
    );
  }

  // ログイン済みの場合
  if (isLoggedIn) {
    return (
      <div className="space-y-4">
        <Button
          onClick={() => router.push("/dashboard")}
          className="w-full py-6 text-lg"
          size="lg"
        >
          ダッシュボードへ
        </Button>
      </div>
    );
  }

  // 自由入力モード
  return (
    <form onSubmit={handleLogin} className="space-y-4">
      {isLoggedIn === null ? (
        <Button disabled className="w-full py-6 text-lg" size="lg">
          読み込み中...
        </Button>
      ) : (
        <>
          {agreementCheckbox}
          <div className="flex gap-2">
            <Input
              type="text"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="mastodon.social"
              disabled={isLoading}
              className="flex-1 py-6 text-lg"
            />
            <Button
              type="submit"
              disabled={isLoading || !server.trim() || !agreed}
              className="py-6 text-lg"
              size="lg"
            >
              {isLoading ? "処理中..." : "ログイン"}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">
            Mastodon または Misskey サーバーのドメインを入力してください
          </p>
        </>
      )}
    </form>
  );
}
