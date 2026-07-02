"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { PermissionInfoDialog } from "@/components/auth/PermissionInfoDialog";
import { LegalInfoDialog } from "@/components/legal/LegalInfoDialog";
import { TermsContent } from "@/components/legal/TermsContent";
import { PrivacyContent } from "@/components/legal/PrivacyContent";
import { ServiceInfoContent } from "@/components/legal/ServiceInfoContent";
import { MastodonIcon } from "@/components/icons/MastodonIcon";
import { MisskeyIcon } from "@/components/icons/MisskeyIcon";

// 直近に使ったサーバー名を記憶する localStorage キー（次回の初期値に使う）
const LAST_SERVER_KEY = "shamezo.lastServer";

// プレースホルダーに順に表示する例サーバー（Mastodon / Misskey 混在）
const PLACEHOLDER_SERVERS = [
  "mastodon.social",
  "mstdn.jp",
  "misskey.io",
  "fedibird.com",
  "pawoo.net",
  "handon.club"
];

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
  // 利用規約への同意（ログイン前に必須）。プライバシーポリシーは同意不要のリンクのみ。
  const [agreed, setAgreed] = useState(false);
  // localStorage から復元した「前回ログインしたサーバー名」（無ければ null）。
  // これがある＝過去にログイン成功済み＝規約同意済みとみなす。
  const [savedServer, setSavedServer] = useState<string | null>(null);
  // 未同意でログインを押したときにトグル横へ出す吹き出し（トグル操作で消える）
  const [showAgreementError, setShowAgreementError] = useState(false);
  // エラーは見出し(message)＋補足(suggestion)に分けて吹き出しで2行表示する
  const [error, setError] = useState<{ message: string; suggestion?: string } | null>(null);

  // プレースホルダーは数秒ごとに例サーバーをローテーション（入力中は停止）
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  useEffect(() => {
    if (server) return;
    const id = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_SERVERS.length);
    }, 3500);
    return () => clearInterval(id);
  }, [server]);

  // ログイン状態はサーバーから受け取った値で確定（クライアント fetch なし）
  const isLoggedIn = initialIsLoggedIn ?? false;

  // 単一サーバー限定モード
  const singleServerMode = allowedServers?.length === 1;

  // 過去に規約同意済みか。保存済みサーバー名があり、かつ自由入力欄をまだ編集していない間は true。
  // true の間は同意トグルを出さず「同意済み」表示にする。サーバー名を編集すると false になりトグルが復活する
  // （単一サーバーモードは入力欄自体が無いので保存済みなら常に同意済み扱い）。
  const termsPreAgreed = savedServer !== null && (singleServerMode || server === savedServer);
  // ログイン可否判定に使う実効同意状態（過去同意済み or 今回トグルON）
  const effectiveAgreed = termsPreAgreed || agreed;

  // 前回使ったサーバー名を初期値として復元し、過去に同意済み（＝トグルを出さない）とみなす。
  // （マウント後にクライアントで実行＝ハイドレーション不整合を避ける）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_SERVER_KEY);
      if (!saved) return;
      // 一度ログイン成功済み＝過去に規約へ同意済みとみなす（termsPreAgreed の根拠）
      setSavedServer(saved);
      // 自由入力モードのみ入力欄にも復元（単一サーバーモードは固定値）
      if (!singleServerMode) setServer(saved);
    } catch {
      // localStorage 不可（プライベートモード等）は無視
    }
  }, [singleServerMode]);

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();

    // ログイン済みの場合はコールバック先（または既定の /dashboard）へ
    if (isLoggedIn) {
      router.push(targetUrl);
      return;
    }

    const targetServer = singleServerMode ? allowedServers[0] : server.trim();

    if (!targetServer) {
      setError({ message: "サーバー名を入力してください" });
      return;
    }

    if (!effectiveAgreed) {
      // エラーはトグル横の吹き出しで表示（サーバー入力欄の吹き出しとは別）
      setShowAgreementError(true);
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
        setError({
          message: data.error?.message || "ログインを開始できませんでした",
          suggestion: data.error?.suggestion,
        });
        setIsLoading(false);
        return;
      }

      // 検証OKで認可へ進むので、次回の初期値として正規化済みサーバー名を記憶
      try {
        localStorage.setItem(LAST_SERVER_KEY, data.server || targetServer);
      } catch {
        // localStorage 不可は無視
      }

      window.location.href = data.url;
    } catch (err) {
      console.error("Login error:", err);
      setError({
        message: "通信に失敗しました",
        suggestion: "電波の良い場所でもう一度お試しください",
      });
      setIsLoading(false);
    }
  };

  // 利用規約への同意トグル（ログイン前に必須）。
  // トグルにだけ <label> を掛け、利用規約リンクは別要素（モーダルを開く）にして「クリックで誤トグル」を防ぐ。
  const agreementToggle = (
    <div className="flex items-center justify-start gap-2">
      {/* トグルを相対基準にして、吹き出しの左端をトグルに合わせ、矢印でトグル（チェックボックス）を指す */}
      <div className="relative">
        {/* label の padding でタップ領域を拡大しつつ、-my-2 で縦の余白は相殺（見た目は詰める） */}
        <label className="flex cursor-pointer items-center p-2 -my-2">
          <span className="inline-flex scale-110">
            <ToggleSwitch
              checked={agreed}
              onChange={() => {
                setAgreed((v) => !v);
                setShowAgreementError(false);
              }}
              disabled={isLoading}
            />
          </span>
        </label>
        {/* 未同意でログインを押したときの吹き出し（トグル操作で消える）。
            左端はトグルに揃え、矢印はトグル中心（左から約32px）を指す。 */}
        {showAgreementError && (
          <>
            <div
              role="alert"
              className="absolute bottom-full left-0 z-20 mb-2 w-max max-w-[16rem] rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium leading-snug text-white shadow-md"
            >
              利用規約に同意してください
            </div>
            <span className="absolute bottom-full left-8 z-20 mb-1 size-2.5 -translate-x-1/2 rotate-45 bg-destructive" />
          </>
        )}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        <LegalInfoDialog
          title="利用規約"
          trigger={
            <button type="button" className="underline hover:text-foreground">
              利用規約
            </button>
          }
        >
          <TermsContent />
        </LegalInfoDialog>
        に同意します
      </p>
    </div>
  );

  // 単一サーバー限定モード: シンプルなボタン
  if (singleServerMode) {
    const loggedInLabel = callbackUrl ? "戻る" : "ダッシュボードへ";
    const buttonLabel = isLoggedIn
      ? loggedInLabel
      : isLoading
        ? "処理中..."
        : `${allowedServers[0]} でログイン`;

    const needsAgreement = !isLoggedIn && !effectiveAgreed;
    return (
      <div className="space-y-4">
        {error && (
          <p className="text-left text-sm text-destructive">
            {error.message}
            {error.suggestion ? `（${error.suggestion}）` : ""}
          </p>
        )}
        {!isLoggedIn && !termsPreAgreed && agreementToggle}
        <Button
          onClick={() => handleLogin()}
          disabled={isLoading}
          aria-disabled={needsAgreement || undefined}
          className={`w-full h-12 text-lg ${needsAgreement ? "opacity-50" : ""}`}
          size="lg"
        >
          {buttonLabel}
        </Button>
        {!isLoggedIn && (
          <p className="text-left text-xs text-muted-foreground">
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
          className="w-full h-12 text-lg"
          size="lg"
        >
          {callbackUrl ? "戻る" : "ダッシュボードへ"}
        </Button>
      </div>
    );
  }

  // 自由入力モード
  const needsInput = !server.trim() || !effectiveAgreed;
  return (
    <form onSubmit={handleLogin} className="space-y-4 text-left">
      {/* 入力欄・同意トグル・ログインボタンは読みやすい幅（max-w-sm）に中央寄せで固定。
          カード自体が広くても各コントロールは広がりすぎないようにする（下のpill列だけは全幅を使う）。 */}
      <div className="space-y-4">
      {/* サーバー入力 */}
      <div className="space-y-2.5">
        <label
          htmlFor="server"
          className="flex flex-wrap items-center justify-start gap-x-2 gap-y-1 text-sm font-medium"
        >
          サーバー：
          <span className="ml-auto flex items-center gap-2 text-xs font-normal text-muted-foreground">
            <span className="flex items-center gap-1">
              <MastodonIcon className="size-3.5" /> Mastodon
            </span>
            <span className="flex items-center gap-1">
              <MisskeyIcon className="size-3.5" /> Misskey
            </span>
          </span>
        </label>
        <div className="relative">
          {/* エラーは入力欄の下に吹き出しで表示（上向き矢印で欄を指す・ログインボタンに重なる） */}
          {error && (
            <div
              role="alert"
              className="absolute inset-x-0 top-full z-20 mt-2 rounded-lg bg-destructive px-3 py-2 text-white shadow-lg"
            >
              <span className="absolute bottom-full left-1/2 size-2.5 -translate-x-1/2 translate-y-1/2 rotate-45 bg-destructive" />
              <p className="text-sm font-semibold leading-snug">{error.message}</p>
              {error.suggestion && (
                <p className="mt-0.5 text-xs leading-snug text-white/90">{error.suggestion}</p>
              )}
            </div>
          )}
          <Input
            id="server"
            type="text"
            value={server}
            onChange={(e) => {
              setServer(e.target.value);
              if (error) setError(null);
            }}
            placeholder={PLACEHOLDER_SERVERS[placeholderIndex]}
            disabled={isLoading}
            aria-invalid={!!error}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className={`h-12 text-lg md:text-lg ${termsPreAgreed ? "pr-11" : ""}`}
          />
          {/* localStorage から復元したサーバー名は × で消せる（消すと同意トグルが復活する） */}
          {termsPreAgreed && (
            <button
              type="button"
              onClick={() => {
                setServer("");
                if (error) setError(null);
              }}
              disabled={isLoading}
              aria-label="サーバー名を消す"
              className="absolute right-2 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* 同意トグル（ログインボタン直前）。過去ログイン済みで未編集なら非表示（サーバー名編集/×で復活） */}
      {!termsPreAgreed && agreementToggle}

      {/* ログイン */}
      <Button
        type="submit"
        disabled={isLoading}
        aria-disabled={needsInput || undefined}
        className={`w-full h-12 text-lg ${needsInput ? "opacity-50" : ""}`}
        size="lg"
      >
        {isLoading ? "処理中..." : "ログイン"}
      </Button>
      </div>

      {/* サービス紹介・権限・プライバシーポリシー（同意は取らずモーダルで読める・同じ体裁のpill）。
          PCなど横幅が確保できる環境（広いカード）では横並び、狭い端末ではpill単位で折り返す。
          各pillは whitespace-nowrap で「1つのリンクの途中で改行」しないようにする。 */}
      <div className="flex flex-wrap items-center justify-start gap-2">
        <LegalInfoDialog
          title="何ができますか？"
          trigger={
            <button
              type="button"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-muted/30 px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <Sparkles className="size-3.5" />
              何ができますか？
            </button>
          }
        >
          <ServiceInfoContent />
        </LegalInfoDialog>
        <PermissionInfoDialog />
        <LegalInfoDialog
          title="プライバシーポリシー"
          trigger={
            <button
              type="button"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-muted/30 px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <Lock className="size-3.5" />
              個人情報はどう扱われますか？
            </button>
          }
        >
          <PrivacyContent />
        </LegalInfoDialog>
      </div>
    </form>
  );
}
