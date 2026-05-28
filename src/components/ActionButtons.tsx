"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActionButtonsProps {
  canGenerate: boolean; // テキスト + 画像が揃っている
  hasPreview: boolean; // 現在のプレビューが最新（再生成不要）
  isLoading: boolean;
  isPosting: boolean;
  onGenerate: () => void;
  onPost: () => void;
}

export function ActionButtons({
  canGenerate,
  hasPreview,
  isLoading,
  isPosting,
  onGenerate,
  onPost,
}: ActionButtonsProps) {
  // プレビューボタン: 未プレビュー or 変更ありのときのみ活性
  const previewDisabled = isLoading || isPosting || !canGenerate || hasPreview;

  // 投稿ボタン: テキスト+画像が揃っていれば常に活性（未プレビューなら内部で生成→投稿）
  const postDisabled = isLoading || isPosting || !canGenerate;

  return (
    <div className="grid grid-cols-2 gap-2">
      {/* プレビューボタン */}
      <Button
        onClick={onGenerate}
        disabled={previewDisabled}
        variant={previewDisabled ? "outline" : "secondary"}
        className={`h-12 ${previewDisabled ? "text-muted-foreground" : ""}`}
        size="lg"
      >
        {isLoading ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="h-4 w-4 animate-spin" />
            プレビュー中...
          </span>
        ) : hasPreview ? (
          "プレビュー済み"
        ) : (
          "プレビュー"
        )}
      </Button>

      {/* 投稿ボタン */}
      <Button
        onClick={onPost}
        disabled={postDisabled}
        variant={postDisabled ? "outline" : "default"}
        className={`h-12 ${postDisabled ? "text-muted-foreground" : ""}`}
        size="lg"
      >
        {isPosting ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="h-4 w-4 animate-spin" />
            投稿中...
          </span>
        ) : (
          "投稿"
        )}
      </Button>
    </div>
  );
}
