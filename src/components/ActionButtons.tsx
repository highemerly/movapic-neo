"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

// 公開範囲の型定義
export type Visibility = "public" | "unlisted" | "local";

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  public: "公開",
  unlisted: "非収載",
  local: "なし",
};

interface ActionButtonsProps {
  instanceDomain: string | undefined;
  instanceType?: string; // "mastodon" | "misskey"
  canGenerate: boolean;
  canPost: boolean;
  canRegenerate: boolean;
  isLoading: boolean;
  isPosting: boolean;
  loadingText: string;
  visibility: Visibility;
  onVisibilityChange: (visibility: Visibility) => void;
  onGenerate: () => void;
  onPost: () => void;
}

export function ActionButtons({
  instanceDomain,
  canGenerate,
  canPost,
  canRegenerate,
  isLoading,
  isPosting,
  loadingText,
  visibility,
  onVisibilityChange,
  onGenerate,
  onPost,
}: ActionButtonsProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  const visibilities: Visibility[] = ["public", "unlisted", "local"];

  // 生成ボタンのラベルとdisabled状態
  const generateButtonLabel = isLoading
    ? loadingText
    : canRegenerate
      ? "画像を再生成"
      : "画像を生成";

  const generateDisabled = isLoading || (!canGenerate && !canRegenerate) || (canPost && !canRegenerate);

  // 投稿ボタンのdisabled状態
  const postDisabled = !canPost || isLoading || isPosting;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[4fr_6fr] gap-2">
      {/* 生成ボタン */}
      <Button
        onClick={onGenerate}
        disabled={generateDisabled}
        variant={generateDisabled ? "outline" : "default"}
        className={`h-14 ${generateDisabled ? "text-muted-foreground" : ""}`}
        size="lg"
      >
        {generateButtonLabel}
      </Button>

      {/* 投稿ボタン（ドロップダウン付き） */}
      <div className="relative h-14" ref={dropdownRef}>
        <div className="flex h-full">
          {/* メイン投稿ボタン */}
          <Button
            onClick={onPost}
            disabled={postDisabled}
            variant={postDisabled ? "outline" : "default"}
            className={`flex-1 rounded-r-none h-full ${postDisabled ? "text-muted-foreground" : ""}`}
            size="lg"
          >
            {visibility === "local" ? (
              <span>投稿</span>
            ) : (
              <span className="flex flex-col items-center leading-tight">
                <span>投稿</span>
                <span className={`text-xs ${postDisabled ? "" : "opacity-80"}`}>
                  ＋{instanceDomain || "未ログイン"}にも
                </span>
                <span className={`text-xs ${postDisabled ? "" : "opacity-80"}`}>
                  同時投稿（{VISIBILITY_LABELS[visibility]}）
                </span>
              </span>
            )}
          </Button>

          {/* ドロップダウントリガー */}
          <Button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            disabled={postDisabled}
            variant={postDisabled ? "outline" : "default"}
            className={`rounded-l-none border-l px-2 h-full ${postDisabled ? "border-border text-muted-foreground" : "border-primary-foreground/20"}`}
            size="lg"
          >
            {isDropdownOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* ドロップダウンメニュー */}
        {isDropdownOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border bg-background shadow-lg z-10">
            {visibilities.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  onVisibilityChange(v);
                  setIsDropdownOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-4 py-3 text-left text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
                  visibility === v
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted"
                }`}
              >
                <div
                  className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                    visibility === v
                      ? "border-primary bg-primary"
                      : "border-muted-foreground"
                  }`}
                >
                  {visibility === v && (
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </div>
                <span>{VISIBILITY_LABELS[v]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        すべての投稿は<Link href="/public" className="underline hover:text-foreground">公開タイムライン</Link>に表示されます
      </p>
    </div>
  );
}
