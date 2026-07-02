import type { ReactNode } from "react";
import Link from "@/components/Link";
import { Button } from "@/components/ui/button";

interface LoginPromptProps {
  /** 「今すぐログインして投稿してみよう！」の見出しを出すか（ログイン済みなら false 推奨） */
  showPrompt?: boolean;
  /**
   * ログイン操作UI本体。TOPは LoginSection（バナー付き）、画像詳細ページの
   * ガイドは素の LoginButton を差し込む（見た目は共通・中身だけ差し替え）。
   */
  children: ReactNode;
}

/**
 * 「今すぐログインして投稿してみよう！」〜「他のユーザーの投稿を見てみる」までの共通ブロック。
 * TOPページ（page.tsx）と画像詳細ページのガイド（NewUserGuide）で同一の見た目を使う。
 * ログイン操作の実体は children で受け取るので、バナーの有無など呼び出し側の事情は差し込みで吸収する。
 */
export function LoginPrompt({ showPrompt = true, children }: LoginPromptProps) {
  return (
    <div>
      {showPrompt && (
        <p className="mb-3 text-left text-sm font-semibold">今すぐログインして投稿してみよう！</p>
      )}

      {children}

      {/* または（左右対称の区切り線なので中央のまま） */}
      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        または
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* 他のユーザーの投稿を見てみる（枠いっぱいの幅） */}
      <Link href="/public" className="block">
        <Button variant="outline" className="w-full">
          他のユーザーの投稿を見てみる
        </Button>
      </Link>
    </div>
  );
}
