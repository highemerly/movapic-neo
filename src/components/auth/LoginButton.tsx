"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/Link";
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
  /**
   * ログイン成功後の遷移先パス（省略時は /dashboard）
   */
  callbackUrl?: string;
  /**
   * ログイン済みか（サーバーで JWT 検証して渡す）。
   * 旧来のクライアント側 fetch("/api/v1/me") を廃止し、初回描画時点で確定させる。
   * 省略時は未ログイン扱い。
   */
  initialIsLoggedIn?: boolean;
}

export function LoginButton({ allowedServers, callbackUrl, initialIsLoggedIn }: LoginButtonProps) {
  const targetUrl = callbackUrl || "/dashboard";
  const router = useRouter();
  const [server, setServer] = useState(
    allowedServers?.length === 1 ? allowedServers[0] : ""
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  // ログイン状態はサーバーから受け取った値で確定（クライアント fetch なし）
  const isLoggedIn = initialIsLoggedIn ?? false;

  // 単一サーバー限定モード
  const singleServerMode = allowedServers?.length === 1;

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();

    // ログイン済みの場合はコールバック先（または既定の /dashboard）へ
    if (isLoggedIn) {
      router.push(targetUrl);
      return;
    }

    const targetServer = singleServerMode ? allowedServers[0] : server.trim();

    if (!targetServer) {
      setError("サーバー名を入力してください");
      return;
    }

    if (!agreed) {
      setError("利用規約・プライバシーポリシーへの同意が必要です");
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
          callbackUrl: targetUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // エラーレスポンスは { success: false, error: { code, message, suggestion? } } 形式
        const message = data.error?.message || "認証の開始に失敗しました";
        const suggestion = data.error?.suggestion;
        throw new Error(suggestion ? `${message}（${suggestion}）` : message);
      }

      window.location.href = data.url;
    } catch (err) {
      console.error("Login error:", err);
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setIsLoading(false);
    }
  };

  const agreementCheckbox = (
    <div className="flex items-center justify-center gap-2.5">
      <Checkbox
        id="agree"
        checked={agreed}
        onCheckedChange={(checked) => setAgreed(checked === true)}
        className="size-5"
      />
      <label htmlFor="agree" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
        <Link href="/terms" className="underline hover:text-foreground">利用規約</Link>
        ・
        <Link href="/privacy" className="underline hover:text-foreground">プライバシーポリシー</Link>
        に同意
      </label>
    </div>
  );

  // 単一サーバー限定モード: シンプルなボタン
  if (singleServerMode) {
    const loggedInLabel = callbackUrl ? "戻る" : "メニューへ";
    const buttonLabel = isLoggedIn
      ? loggedInLabel
      : isLoading
        ? "処理中..."
        : `${allowedServers[0]} でログイン`;

    const needsAgreement = !isLoggedIn && !agreed;
    return (
      <div className="space-y-4">
        {!isLoggedIn && agreementCheckbox}
        {error && <p className="text-center text-sm text-destructive">{error}</p>}
        <Button
          onClick={() => handleLogin()}
          disabled={isLoading}
          aria-disabled={needsAgreement || undefined}
          className={`w-full py-6 text-lg ${needsAgreement ? "opacity-50" : ""}`}
          size="lg"
        >
          {buttonLabel}
        </Button>
        {!isLoggedIn && (
          <p className="text-center text-xs text-muted-foreground">
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
          onClick={() => router.push(targetUrl)}
          className="w-full py-6 text-lg"
          size="lg"
        >
          {callbackUrl ? "戻る" : "メニューへ"}
        </Button>
      </div>
    );
  }

  // 自由入力モード
  return (
    <form onSubmit={handleLogin} className="space-y-4">
      {agreementCheckbox}
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
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
          disabled={isLoading}
          aria-disabled={(!server.trim() || !agreed) || undefined}
          className={`shrink-0 py-6 px-4 text-sm ${(!server.trim() || !agreed) ? "opacity-50" : ""}`}
          size="lg"
        >
          {isLoading ? "処理中..." : "ログイン"}
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Mastodon サーバーのドメインを入力してください
      </p>
    </form>
  );
}
