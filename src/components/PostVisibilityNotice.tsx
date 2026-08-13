"use client";

import { Info } from "lucide-react";
import Link from "@/components/Link";
import { Visibility } from "@/types";

interface PostVisibilityNoticeProps {
  visibility: Visibility;
  instanceDomain?: string;
  /** 連携先の種別（"mastodon" | "misskey"）。公開範囲の用語を合わせる。 */
  instanceType?: string;
}

export function PostVisibilityNotice({
  visibility,
  instanceDomain,
  instanceType,
}: PostVisibilityNoticeProps) {
  const domain = instanceDomain || "連携サーバー";
  // Misskey に「非収載」は無く「ホーム」が相当（値は unlisted のまま）。
  const unlistedTerm = instanceType === "misskey" ? "ホーム投稿" : "非収載投稿";

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
            に表示されます。{domain} では{unlistedTerm}となります
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

interface PostLocationNoticeProps {
  locationLabel: string;
}

export function PostLocationNotice({ locationLabel }: PostLocationNoticeProps) {
  return (
    <div className="flex items-start gap-1.5 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        投稿には撮影場所「{locationLabel}」が表示され、誰でも閲覧できます
      </span>
    </div>
  );
}
