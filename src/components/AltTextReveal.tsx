"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AltTextRevealProps {
  /** 画像の代替テキスト（ALT）。null/空なら何も出さず children だけ描画。 */
  altText?: string | null;
  /** 画像本体（RetryImage を含むコンテナ）。 */
  children: React.ReactNode;
}

/**
 * 画像詳細ページで、ALT が設定されている画像にだけ Mastodon 風の「ALT」バッジを重ね、
 * 押すとポップアップ（ダイアログ）で代替テキストを表示する。
 * ALT が無い画像では children をそのまま返す（バッジも出さない）。
 */
export function AltTextReveal({ altText, children }: AltTextRevealProps) {
  const [open, setOpen] = useState(false);
  const alt = altText?.trim();

  if (!alt) return <>{children}</>;

  return (
    <>
      <div className="relative">
        {children}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-1 text-[11px] font-bold leading-none text-white transition-colors hover:bg-black/75"
          aria-label="代替テキスト（ALT）を表示"
        >
          ALT
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>代替テキスト（ALT）</DialogTitle>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap break-words">{alt}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
