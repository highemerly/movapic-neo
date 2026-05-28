"use client";

import { useState } from "react";
import { ChevronDown, Bot, Mail } from "lucide-react";

export function OtherPostMethods() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border bg-muted/30">
      {/* アコーディオンヘッダー */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">他の投稿方法</span>
          <span className="text-xs text-muted-foreground">
            Bot・メールからも投稿できます
          </span>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-muted-foreground transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* アコーディオンコンテンツ */}
      {isOpen && (
        <div className="space-y-3 px-4 pb-4 pt-1">
          {/* Bot投稿 */}
          <div className="flex gap-3 rounded-lg border bg-background p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">Mastodonから</p>
              <p className="text-sm text-muted-foreground">
                <span className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  @pic@handon.club
                </span>{" "}
                に画像付きでメンションすると、文字入れして再投稿します。
              </p>
              <p className="text-xs text-muted-foreground">
                例: <span className="font-mono">@pic [上 赤 大] こんにちは</span>
              </p>
            </div>
          </div>

          {/* メール投稿 */}
          <div className="flex gap-3 rounded-lg border bg-background p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">メール投稿</p>
              <p className="text-sm text-muted-foreground">
                専用メールアドレスに画像を送信して投稿できます。
              </p>
              <p className="text-xs text-muted-foreground">
                メールアドレスは
                <a href="/settings" className="underline hover:text-foreground">
                  設定ページ
                </a>
                で確認できます。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
