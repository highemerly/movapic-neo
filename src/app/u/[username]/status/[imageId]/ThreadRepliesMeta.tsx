"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import Link from "@/components/Link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MetaItem } from "./MetaItem";

/** ダイアログに並べる1件（URL はサーバーで解決済み。HOME_SERVER 等の env をクライアントで読まないため）。 */
export type ThreadReplyItem = {
  id: string;
  href: string;
  thumbnailUrl: string;
};

/**
 * メタ行の「スレッドの続き N件」（＝この写真への直接のリプライ）。押すとその写真だけを格子状に並べたダイアログを開き、
 * 写真を押すとその投稿へ移動する。アカウント名や挿入コメントは出さない（写真で選ぶ）。
 * 件数・一覧は閲覧者のミュート相手を除いた値（呼び出し側で落とし済み＝ミュートは muter の視界だけ）。
 */
export function ThreadRepliesMeta({
  count,
  replies,
  hasMore,
}: {
  count: number;
  replies: ThreadReplyItem[];
  hasMore: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;

  return (
    <>
      <MetaItem
        as="button"
        onClick={() => setOpen(true)}
        title="スレッドの続きを表示"
        icon={<MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      >
        スレッドの続き {count}件
      </MetaItem>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle>スレッドの続き {count}件</DialogTitle>
            <DialogDescription className="sr-only">
              この写真に続けて投稿された写真の一覧
            </DialogDescription>
          </DialogHeader>
          <ul className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto">
            {replies.map((r) => (
              <li key={r.id}>
                <Link
                  href={r.href}
                  onClick={() => setOpen(false)}
                  className="block overflow-hidden rounded-md transition-opacity hover:opacity-80"
                >
                  {/* 保存サムネ（128px WebP）はデコードが軽くリトライ不要（docs/ui.md） */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.thumbnailUrl}
                    alt=""
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                </Link>
              </li>
            ))}
          </ul>
          {hasMore && (
            <p className="text-xs text-muted-foreground">ほかにも続きがあります</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
