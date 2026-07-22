"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { FavoriterAvatars } from "@/components/user/FavoriterAvatars";
import { subscribeFavorite, type FavoriterInfo } from "./favoriteSync";

/**
 * お気に入り者アイコン列の“読み取り専用”インライン表示（画像詳細ページ用）。
 * メタ情報（カレンダー・フォント）と同様に先頭へミュートな ♡ アイコンを付け、続けて
 * お気に入り者のアイコンを並べる。操作（トグル）はしない＝ログイン時はアクションバーのトグルが、
 * favoriteSync で emit するのを購読して即時反映。未ログインはトグルが無いのでサーバー初期値の静的表示。
 * お気に入りが0件のときは（♡だけ浮かないよう）行ごと描画しない。
 */
export function FavoriteAvatarsLive({
  imageId,
  initialFavoriters,
}: {
  imageId: string;
  initialFavoriters: FavoriterInfo[];
}) {
  const [favoriters, setFavoriters] =
    useState<FavoriterInfo[]>(initialFavoriters);

  useEffect(
    () => subscribeFavorite(imageId, (snap) => setFavoriters(snap.favoriters)),
    [imageId],
  );

  if (favoriters.length === 0) return null;

  return (
    <div className="mt-[10px] flex items-center gap-2 text-muted-foreground">
      <Heart className="h-4 w-4 shrink-0" aria-label="お気に入りした人" />
      <FavoriterAvatars
        size="md"
        items={favoriters.map((f) => ({
          acct: f.acct,
          label: f.displayName || f.acct,
          avatarUrl: f.avatarUrl,
          profileUrl: f.profileUrl,
        }))}
      />
    </div>
  );
}
