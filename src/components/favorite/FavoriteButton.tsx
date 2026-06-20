"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Heart } from "lucide-react";
import { formatFavoriteCount } from "@/lib/utils";

interface Favoriter {
  acct: string;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
}

interface FavoriteButtonProps {
  imageId: string;
  initialCount: number;
  initialIsFavorited: boolean;
  initialFavoriters: Favoriter[];
  canFavorite: boolean;
  initialSyncError?: string | null;
  disabledReason?: string;
}

export function FavoriteButton({
  imageId,
  initialCount,
  initialIsFavorited,
  initialFavoriters,
  canFavorite,
  initialSyncError,
  disabledReason,
}: FavoriteButtonProps) {
  const [isFavorited, setIsFavorited] = useState(initialIsFavorited);
  const [count, setCount] = useState(initialCount);
  const [favoriters, setFavoriters] = useState<Favoriter[]>(initialFavoriters);
  const [statusMessage, setStatusMessage] = useState<string | null>(initialSyncError ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);

  // マウント時にMastodonの最新状態へ同期（サーバー側でTTL切れ時のみMastodonにアクセス）
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
      } catch {
        // ネットワーク等で同期API自体に到達できない場合
        setStatusMessage("お気に入り情報の同期に失敗しました");
      }
    })();
  }, [imageId]);

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
      setCount(data.favoriteCount);
      setIsFavorited(data.isFavorited);
      setFavoriters(data.favoriters ?? previousFavoriters);
      setStatusMessage(data.syncError ?? null);
    } catch {
      setIsFavorited(wasFavorited);
      setCount(previousCount);
      setFavoriters(previousFavoriters);
      setStatusMessage("お気に入り操作中にエラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  }, [imageId, canFavorite, isLoading, isFavorited, count, favoriters]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <button
            onClick={handleFavorite}
            disabled={!canFavorite || isLoading}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md transition-colors ${
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

        {/* お気に入りした人（Mastodon、外部プロフィールへリンク） */}
        {favoriters.length > 0 && (
          <div className="flex-1 min-w-0 overflow-x-auto">
            <div className="flex items-center gap-1 w-max">
              {favoriters.map((favoriter) => {
                const label = favoriter.displayName || favoriter.acct;
                const avatar = favoriter.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={favoriter.avatarUrl}
                    alt={label}
                    className="w-6 h-6 rounded-full hover:opacity-80 transition-opacity"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-muted-foreground/20 flex items-center justify-center text-xs text-muted-foreground hover:opacity-80 transition-opacity">
                    {label.charAt(0)}
                  </div>
                );

                return favoriter.profileUrl ? (
                  <a
                    key={favoriter.acct}
                    href={favoriter.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={label}
                    className="shrink-0"
                  >
                    {avatar}
                  </a>
                ) : (
                  <span key={favoriter.acct} title={label} className="shrink-0">
                    {avatar}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* お気に入り取得・操作の失敗メッセージ */}
      {statusMessage && (
        <p className="mt-1.5 text-[11px] text-muted-foreground/70">{statusMessage}</p>
      )}
    </div>
  );
}
