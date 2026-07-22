"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Heart } from "lucide-react";
import { FavoriterAvatars } from "@/components/user/FavoriterAvatars";
import { formatFavoriteCount } from "@/lib/utils";
import {
  emitFavorite,
  subscribeFavorite,
  type FavoriterInfo,
} from "./favoriteSync";

interface FavoriteButtonProps {
  imageId: string;
  initialCount: number;
  initialIsFavorited: boolean;
  initialFavoriters: FavoriterInfo[];
  canFavorite: boolean;
  initialSyncError?: string | null;
  disabledReason?: string;
  /**
   * コンパクト表示。トグル（ハート＋件数）だけを描画し、お気に入り者のアバター列・エラー文言行は
   * 出さない。画像詳細ページのアクションバー（PCインライン行／モバイルのフローティング）用。
   * アバターは別途インラインに常時表示する。エラーは title に載せる。
   */
  compact?: boolean;
  /**
   * compact のとき、フローティング（透過コンテナ上）で使うか。true なら自前の背景＋影＋
   * pointer-events-auto を付けて浮いて見せる。false（PCインライン行）は他ボタンと同じ素の枠。
   */
  floating?: boolean;
}

export function FavoriteButton({
  imageId,
  initialCount,
  initialIsFavorited,
  initialFavoriters,
  canFavorite,
  initialSyncError,
  disabledReason,
  compact = false,
  floating = false,
}: FavoriteButtonProps) {
  const [isFavorited, setIsFavorited] = useState(initialIsFavorited);
  const [count, setCount] = useState(initialCount);
  const [favoriters, setFavoriters] = useState<FavoriterInfo[]>(initialFavoriters);
  const [statusMessage, setStatusMessage] = useState<string | null>(initialSyncError ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);

  // マウント時にFediverseの最新状態へ同期（サーバー側でTTL切れ時のみオーナーへアクセス）
  const hasSynced = useRef(false);
  useEffect(() => {
    if (hasSynced.current) return;
    hasSynced.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/v1/images/${imageId}/favorite`);
        if (!res.ok) return;
        const data = await res.json();
        setCount(data.favoriteCount);
        setIsFavorited(data.isFavorited);
        setFavoriters(data.favoriters ?? []);
        setStatusMessage(data.syncError ?? null);
        // 同ページの他インスタンス（トグルの片割れ・アイコン列）へ同期結果を配信
        emitFavorite(imageId, {
          count: data.favoriteCount,
          isFavorited: data.isFavorited,
          favoriters: data.favoriters ?? [],
          statusMessage: data.syncError ?? null,
        });
      } catch {
        // ネットワーク等で同期API自体に到達できない場合
        setStatusMessage("お気に入り情報の同期に失敗しました");
      }
    })();
  }, [imageId]);

  // 同ページの他インスタンスの変更を受信して自分の表示を更新する（受信側は emit しない＝echo防止）。
  useEffect(
    () =>
      subscribeFavorite(imageId, (snap) => {
        setCount(snap.count);
        setIsFavorited(snap.isFavorited);
        setFavoriters(snap.favoriters);
        setStatusMessage(snap.statusMessage);
      }),
    [imageId],
  );

  const handleFavorite = useCallback(async () => {
    if (!canFavorite || isLoading) return;

    const wasFavorited = isFavorited;
    const previousCount = count;
    const previousFavoriters = favoriters;

    // Optimistic update
    setIsFavorited(!wasFavorited);
    setCount(wasFavorited ? count - 1 : count + 1);
    if (!wasFavorited) {
      setShowAnimation(true);
      setTimeout(() => setShowAnimation(false), 600);
    }

    setIsLoading(true);
    setStatusMessage(null);
    try {
      const response = await fetch(`/api/v1/images/${imageId}/favorite`, {
        method: wasFavorited ? "DELETE" : "POST",
      });

      if (!response.ok) {
        setIsFavorited(wasFavorited);
        setCount(previousCount);
        setFavoriters(previousFavoriters);
        const body = await response.json().catch(() => null);
        const message = body?.error?.message ?? "お気に入り操作に失敗しました";
        const suggestion = body?.error?.suggestion;
        setStatusMessage(suggestion ? `${message}（${suggestion}）` : message);
        return;
      }

      const data = await response.json();
      const nextFavoriters = data.favoriters ?? previousFavoriters;
      setCount(data.favoriteCount);
      setIsFavorited(data.isFavorited);
      setFavoriters(nextFavoriters);
      setStatusMessage(data.syncError ?? null);
      // 成功時のみ配信（楽観更新・失敗リバートは自インスタンス内で完結し、他インスタンスは元々未変更）。
      emitFavorite(imageId, {
        count: data.favoriteCount,
        isFavorited: data.isFavorited,
        favoriters: nextFavoriters,
        statusMessage: data.syncError ?? null,
      });
    } catch {
      setIsFavorited(wasFavorited);
      setCount(previousCount);
      setFavoriters(previousFavoriters);
      setStatusMessage("お気に入り操作中にエラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  }, [imageId, canFavorite, isLoading, isFavorited, count, favoriters]);

  // コンパクト（アクションバー）: トグルのピルだけを描く。floating（透過コンテナ上）のときだけ
  // 自前の背景＋影を付けて浮いて見せ、クリック透過コンテナの中で押せるよう pointer-events-auto を持つ。
  if (compact) {
    return (
      <div className="relative shrink-0 pointer-events-auto">
        <button
          onClick={handleFavorite}
          disabled={!canFavorite || isLoading}
          className={`flex items-center gap-1.5 px-3 h-[44px] border rounded-md transition-colors ${
            floating ? "bg-background/60 backdrop-blur-xl shadow-md " : ""
          }${
            isFavorited
              ? "text-red-500 hover:text-red-600 border-red-200"
              : "text-muted-foreground hover:text-red-500 border-border"
          } ${!canFavorite ? "cursor-not-allowed opacity-50" : ""}`}
          title={statusMessage ?? (!canFavorite ? disabledReason : undefined)}
          aria-label="お気に入り"
        >
          <Heart
            className={`h-4 w-4 transition-all ${isFavorited ? "fill-current" : ""}`}
          />
          <span className="text-sm font-medium">{formatFavoriteCount(count)}</span>
        </button>
        {showAnimation && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Heart className="h-4 w-4 fill-red-500 text-red-500 animate-float-up" />
          </div>
        )}
      </div>
    );
  }

  // 親（status ページ）の flex 行の唯一の子。className 無しだと flex:0 1 auto で
  // 中身の幅に縮み、内側の FavoriterAvatars(flex-1) に空き幅が渡らず「収まる数」を
  // 測れない（cw==コンテンツ幅の境界に貼り付き、わずかな揺らぎで誤って「…」が出る）。
  // 行幅まで伸ばして FavoriterAvatars に実測用の余白を与える。
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <button
            onClick={handleFavorite}
            disabled={!canFavorite || isLoading}
            className={`flex items-center gap-1.5 px-4 h-[44px] border rounded-md transition-colors ${
              isFavorited
                ? "text-red-500 hover:text-red-600 border-red-200"
                : "text-muted-foreground hover:text-red-500 border-border"
            } ${!canFavorite ? "cursor-not-allowed opacity-50" : ""}`}
            title={!canFavorite ? disabledReason : undefined}
          >
            <Heart
              className={`h-4 w-4 transition-all ${isFavorited ? "fill-current" : ""}`}
            />
            <span className="text-sm font-medium">{formatFavoriteCount(count)}</span>
          </button>

          {/* Floating heart animation */}
          {showAnimation && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Heart className="h-4 w-4 fill-red-500 text-red-500 animate-float-up" />
            </div>
          )}
        </div>

        {/* お気に入りした人（Mastodon、外部プロフィールへリンク）。
            数が多いとアイコンが行からはみ出すため、FavoriterAvatars が
            コンテナ実幅を測って収まる数だけ描き、あふれ分は末尾「…」で切る。 */}
        {favoriters.length > 0 && (
          <FavoriterAvatars
            size="md"
            items={favoriters.map((f) => ({
              acct: f.acct,
              label: f.displayName || f.acct,
              avatarUrl: f.avatarUrl,
              profileUrl: f.profileUrl,
            }))}
          />
        )}
      </div>

      {/* お気に入り取得・操作の失敗メッセージ */}
      {statusMessage && (
        <p className="mt-1.5 text-[11px] text-muted-foreground/70">{statusMessage}</p>
      )}
    </div>
  );
}
