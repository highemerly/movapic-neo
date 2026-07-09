"use client";

import { useSearchParams } from "next/navigation";
import { Lock, AlertCircle } from "lucide-react";
import { LoginButton } from "./LoginButton";
import { LoginPrompt } from "./LoginPrompt";
import { AboutShamezo } from "@/components/onboarding/AboutShamezo";

interface LoginSectionProps {
  allowedServers?: string[];
  initialIsLoggedIn?: boolean;
}

function getLoginRequiredMessage(returnTo: string): string {
  if (returnTo === "/create") return "写真を投稿するにはログインが必要です";
  if (returnTo === "/favorite") return "お気に入りを見るにはログインが必要です";
  if (returnTo === "/dashboard") return "ダッシュボードを見るにはログインが必要です";
  if (returnTo === "/settings") return "設定を変更するにはログインが必要です";
  return "このページを使うにはログインが必要です";
}

function getErrorMessage(code: string): string {
  switch (code) {
    case "oauth_denied":
      return "ログインがキャンセルされました";
    case "invalid_request":
      return "不正なリクエストです。もう一度お試しください";
    case "invalid_state":
    case "invalid_signature":
      return "認証情報が無効です。もう一度お試しください";
    case "expired_state":
    case "session_expired":
      return "認証セッションの有効期限が切れました。もう一度お試しください";
    case "invalid_session":
      return "認証セッションが無効です。もう一度お試しください";
    case "auth_failed":
      return "認証に失敗しました。もう一度お試しください";
    default:
      return "ログイン中にエラーが発生しました。もう一度お試しください";
  }
}

function sanitizeReturnTo(value: string | null): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith("/")) return undefined;
  if (value.startsWith("//")) return undefined;
  if (value.includes("\\")) return undefined;
  if (value.includes("..")) return undefined;
  return value;
}

export function LoginSection({ allowedServers, initialIsLoggedIn }: LoginSectionProps) {
  const params = useSearchParams();
  const reason = params.get("reason");
  const errorCode = params.get("error");
  const returnTo = sanitizeReturnTo(params.get("returnTo"));
  const showLoginRequired = reason === "login_required" && !!returnTo;
  // 上部に警告バナー（エラー／ログイン必須）が出るときは「今すぐログイン…」の見出しは冗長なので消す。
  const hasBanner = !!errorCode || showLoginRequired;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden text-left">
      {errorCode ? (
        <div className="bg-destructive/10 px-5 py-3 flex items-start justify-start gap-2.5 border-b border-border">
          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm font-semibold leading-snug text-destructive">
            {getErrorMessage(errorCode)}
          </p>
        </div>
      ) : showLoginRequired ? (
        <div className="bg-primary/5 px-5 py-3 flex items-start justify-start gap-2.5 border-b border-border">
          <Lock className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-sm font-semibold leading-snug">
            {getLoginRequiredMessage(returnTo!)}
          </p>
        </div>
      ) : null}
      <div className="px-5 py-5">
        {/* 未ログイン時はカード上部に「SHAMEZO（しゃめぞう）とは？」の説明を出す（画像詳細ページのガイドと共通）。
            リピーター（localStorage にサーバー名あり）には AboutShamezo 自身が非表示になる。下マージンも自身が持つ。 */}
        {!initialIsLoggedIn && <AboutShamezo />}
        {/* 見出し〜「他のユーザーの投稿を見てみる」まで、画像詳細ページのガイドと共通のブロックをカード内に収める。 */}
        <LoginPrompt showPrompt={!initialIsLoggedIn && !hasBanner}>
          <LoginButton allowedServers={allowedServers} callbackUrl={returnTo} initialIsLoggedIn={initialIsLoggedIn} />
        </LoginPrompt>
      </div>
    </div>
  );
}
