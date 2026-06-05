"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";

export function RevokeSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRevoke = async () => {
    if (
      !window.confirm(
        "このセッションを失効させますか？\nこの端末からのログインは無効になり、再ログインが必要になります。"
      )
    ) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "失効に失敗しました");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "失効に失敗しました");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleRevoke}
        disabled={loading}
        className="inline-flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <LogOut className="h-3 w-3" />
        )}
        失効させる
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
