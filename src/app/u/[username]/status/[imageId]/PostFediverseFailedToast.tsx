"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

/**
 * サーバーが返した HTTP ステータスコードから、ユーザー向けの対応案内文を決める。
 * status を持たない（タイムアウト・接続失敗）場合は undefined を渡す。
 */
function statusAdvice(statusCode?: number): string {
  if (statusCode === undefined) {
    return "が過負荷または障害の可能性があります。時間をおいて再度お試しください。";
  }
  if (statusCode === 401 || statusCode === 403) {
    return "への権限が不足しています。一度ログアウトして再ログインをお試しください。";
  }
  if (statusCode === 404 || statusCode === 410) {
    return "での投稿先が見つからないか、サーバーが閉鎖されています。一度ログアウトして再ログインをお試しください。";
  }
  if (statusCode === 422) {
    return "で投稿を受け付けてもらえませんでした。時間をおいて再度お試しください。";
  }
  if (statusCode === 429) {
    return "でリクエストが集中しています。しばらく待ってから再度お試しください。";
  }
  if (statusCode >= 500) {
    return "が過負荷または障害の可能性があります。時間をおいて再度お試しください。";
  }
  return "時間をおいて再度お試しください。";
}

/**
 * SHAMEZOへの保存は成功したが Mastodon/Misskey への投稿だけ失敗したときに出す警告トースト。
 * 成功トーストと違い「完了」ではないので自動では消さず、ユーザーが閉じるまで残す。
 * サーバー名・サーバーが返したステータスコード・対応案内を表示する。
 */
export function PostFediverseFailedToast({
  serverDomain,
  statusCode,
}: {
  serverDomain: string;
  statusCode?: number;
}) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 top-14 z-[60] flex justify-center px-4">
      <div className="flex w-full max-w-md items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-50 px-4 py-3 shadow-lg dark:bg-amber-950">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 space-y-1 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium">
            この画像はSHAMEZOには投稿できましたが、{serverDomain} への投稿に失敗しました。
          </p>
          <p>
            サーバーからの応答:{" "}
            {statusCode !== undefined ? `${statusCode}` : "応答なし"}
          </p>
          <p>（{serverDomain} {statusAdvice(statusCode)}）</p>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="shrink-0 text-amber-600/70 transition-colors hover:text-amber-600 dark:text-amber-400/70"
          aria-label="閉じる"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
