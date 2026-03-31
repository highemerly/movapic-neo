"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { formatFavoriteCount } from "@/lib/utils";

interface Favoriter {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface FavoriteButtonProps {
  imageId: string;
  initialCount: number;
  initialIsFavorited: boolean;
  recentFavoriters: Favoriter[];
  isLoggedIn: boolean;
}

export function FavoriteButton({
  imageId,
  initialCount,
  initialIsFavorited,
  recentFavoriters: initialFavoriters,
  isLoggedIn,
}: FavoriteButtonProps) {
  const [isFavorited, setIsFavorited] = useState(initialIsFavorited);
  const [count, setCount] = useState(initialCount);
  const [recentFavoriters, setRecentFavoriters] =
    useState<Favoriter[]>(initialFavoriters);
  const [isLoading, setIsLoading] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);

  const handleFavorite = useCallback(async () => {
    if (!isLoggedIn || isLoading) return;

    const wasForited = isFavorited;
    const previousCount = count;
    const previousFavoriters = recentFavoriters;

    // Optimistic update
    setIsFavorited(!wasForited);
    setCount(wasForited ? count - 1 : count + 1);

    // Show animation when adding favorite
    if (!wasForited) {
      setShowAnimation(true);
      setTimeout(() => setShowAnimation(false), 600);
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/v1/images/${imageId}/favorite`, {
        method: wasForited ? "DELETE" : "POST",
      });

      if (!response.ok) {
        // Revert on error
        setIsFavorited(wasForited);
        setCount(previousCount);
        setRecentFavoriters(previousFavoriters);
        const data = await response.json();
        console.error("Favorite error:", data.error);
        return;
      }

      // Update with actual server data
      const data = await response.json();
      setCount(data.favoriteCount);
      setIsFavorited(data.isFavorited);

      // Refresh favoriters list
      const statusResponse = await fetch(`/api/v1/images/${imageId}/favorite`);
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        setRecentFavoriters(statusData.recentFavoriters);
      }
    } catch (error) {
      // Revert on error
      setIsFavorited(wasForited);
      setCount(previousCount);
      setRecentFavoriters(previousFavoriters);
      console.error("Favorite error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [imageId, isLoggedIn, isLoading, isFavorited, count, recentFavoriters]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          onClick={handleFavorite}
          disabled={!isLoggedIn || isLoading}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md transition-colors ${
            isFavorited
              ? "text-red-500 hover:text-red-600 border-red-200"
              : "text-muted-foreground hover:text-red-500 border-border"
          } ${!isLoggedIn ? "cursor-not-allowed opacity-50" : ""}`}
          title={!isLoggedIn ? "ログインするとお気に入り登録できます" : undefined}
        >
          <Heart
            className={`h-4 w-4 transition-all ${
              isFavorited ? "fill-current" : ""
            }`}
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

      {/* Recent favoriters */}
      {recentFavoriters.length > 0 && (
        <div className="flex items-center gap-1">
          {recentFavoriters.slice(0, 5).map((favoriter) => (
            <Link key={favoriter.username} href={`/u/${favoriter.username}`} title={favoriter.displayName || favoriter.username}>
              {favoriter.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={favoriter.avatarUrl}
                  alt={favoriter.displayName || favoriter.username}
                  className="w-6 h-6 rounded-full hover:opacity-80 transition-opacity"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-muted-foreground/20 flex items-center justify-center text-xs text-muted-foreground hover:opacity-80 transition-opacity">
                  {(favoriter.displayName || favoriter.username).charAt(0)}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
