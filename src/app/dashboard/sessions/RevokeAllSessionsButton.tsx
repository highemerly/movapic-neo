"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/providers/ConfirmProvider";

export function RevokeAllSessionsButton({ count }: { count: number }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);

  const handleRevokeAll = async () => {
    if (
      !(await confirm({
        title: "他のセッションをすべて失効",
        description:
          "現在使用中のこの端末を除く、すべての端末からのログインを無効化します。各端末で再ログインが必要になります。",
        confirmText: "すべて失効させる",
        destructive: true,
      }))
    ) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/sessions", { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "失効に失敗しました");
      }
      toast.success(`${data?.count ?? count}件のセッションを失効しました`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失効に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleRevokeAll}
      disabled={loading}
      className="inline-flex items-center gap-1.5 -my-1 -mr-2 rounded-md px-2 py-2 text-xs text-destructive hover:underline disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <LogOut className="h-3.5 w-3.5" />
      )}
      現在のセッション以外をすべて失効
    </button>
  );
}
