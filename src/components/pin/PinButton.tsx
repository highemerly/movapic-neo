"use client";

import { useState, useCallback } from "react";
import { Pin } from "lucide-react";

interface PinButtonProps {
  imageId: string;
  initialIsPinned: boolean;
}

export function PinButton({
  imageId,
  initialIsPinned,
}: PinButtonProps) {
  const [isPinned, setIsPinned] = useState(initialIsPinned);
  const [isLoading, setIsLoading] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);

  const handlePin = useCallback(async () => {
    if (isLoading) return;

    const wasPinned = isPinned;

    // Optimistic update
    setIsPinned(!wasPinned);

    // Show animation when pinning
    if (!wasPinned) {
      setShowAnimation(true);
      setTimeout(() => setShowAnimation(false), 600);
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/v1/images/${imageId}/pin`, {
        method: wasPinned ? "DELETE" : "POST",
      });

      if (!response.ok) {
        // Revert on error
        setIsPinned(wasPinned);
        const data = await response.json();
        if (data.error?.message) {
          alert(data.error.message);
        }
        return;
      }
    } catch (error) {
      // Revert on error
      setIsPinned(wasPinned);
      console.error("Pin error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [imageId, isLoading, isPinned]);

  return (
    <div className="relative">
      <button
        onClick={handlePin}
        disabled={isLoading}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md transition-colors ${
          isPinned
            ? "text-amber-500 hover:text-amber-600 border-amber-200"
            : "text-muted-foreground hover:text-amber-500 border-border"
        }`}
        title={isPinned ? "ピン留めを解除" : "ピン留め"}
      >
        <Pin
          className={`h-4 w-4 transition-all ${
            isPinned ? "fill-current" : ""
          }`}
        />
        <span className="text-xs text-muted-foreground">
          {isPinned ? "ピン留め中" : "ピン留め"}
        </span>
      </button>

      {/* Floating pin animation */}
      {showAnimation && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Pin className="h-4 w-4 fill-amber-500 text-amber-500 animate-float-up" />
        </div>
      )}
    </div>
  );
}
