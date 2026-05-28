"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { Visibility } from "@/types";

interface PostVisibilityNoticeProps {
  visibility: Visibility;
  instanceDomain?: string;
}

export function PostVisibilityNotice({
  visibility,
  instanceDomain,
}: PostVisibilityNoticeProps) {
  const domain = instanceDomain || "連携サーバー";

  return (
    <div className="flex items-start gap-1.5 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        {visibility === "public" && (
          <>
            投稿は
            <Link href="/public" className="underline hover:text-foreground">
              みんなの写真
            </Link>
            および {domain} の公開タイムラインに表示されます
          </>
        )}
        {visibility === "unlisted" && (
          <>
            投稿は
            <Link href="/public" className="underline hover:text-foreground">
              みんなの写真
            </Link>
            に表示されます。{domain} では非収載投稿になります（タイムラインには出ません）
          </>
        )}
        {visibility === "local" && (
          <>
            投稿は
            <Link href="/public" className="underline hover:text-foreground">
              みんなの写真
            </Link>
            にのみ表示されます。{domain} には投稿されません
          </>
        )}
      </span>
    </div>
  );
}
