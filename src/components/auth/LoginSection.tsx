"use client";

import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { LoginButton } from "./LoginButton";

interface LoginSectionProps {
  allowedServers?: string[];
}

function getBannerMessage(returnTo: string): string {
  if (returnTo === "/create") return "写真を投稿するにはログインが必要です";
  if (returnTo === "/favorite") return "お気に入りを見るにはログインが必要です";
  if (returnTo === "/dashboard") return "ダッシュボードを見るにはログインが必要です";
  if (returnTo === "/settings") return "設定を変更するにはログインが必要です";
  return "このページを使うにはログインが必要です";
}

function sanitizeReturnTo(value: string | null): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith("/")) return undefined;
  if (value.startsWith("//")) return undefined;
  if (value.includes("\\")) return undefined;
  if (value.includes("..")) return undefined;
  return value;
}

export function LoginSection({ allowedServers }: LoginSectionProps) {
  const params = useSearchParams();
  const reason = params.get("reason");
  const returnTo = sanitizeReturnTo(params.get("returnTo"));
  const showBanner = reason === "login_required" && !!returnTo;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden text-center">
      {showBanner && (
        <div className="bg-primary/5 px-5 py-3 flex items-start justify-center gap-2.5 border-b border-border">
          <Lock className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-sm font-semibold leading-snug">
            {getBannerMessage(returnTo!)}
          </p>
        </div>
      )}
      <div className="px-5 py-5">
        <LoginButton allowedServers={allowedServers} callbackUrl={returnTo} />
      </div>
    </div>
  );
}
