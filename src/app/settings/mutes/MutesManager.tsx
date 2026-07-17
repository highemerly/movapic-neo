"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VolumeX } from "lucide-react";
import { toast } from "sonner";

import Link from "@/components/Link";
import { RetryImg } from "@/components/RetryImg";
import { Button } from "@/components/ui/button";
import { userPathSegment } from "@/lib/userHandle";
import { useHomeServer } from "@/components/HomeServerProvider";

export type MuteEntryDto = {
  id: string;
  /** ISO文字列 or null（無期限） */
  expiresAt: string | null;
  mutedUser: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    domain: string;
  };
};

const expiryFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tokyo",
});

function expiryLabel(expiresAt: string | null): string {
  if (!expiresAt) return "無期限";
  return `${expiryFormatter.format(new Date(expiresAt))} まで`;
}

/**
 * ミュート管理UI（設定ページ専用）。既存ミュートの確認・解除を行う。
 * 追加はユーザーページ／画像詳細から行うため、ここには追加導線を置かない。
 * 変更後は router.refresh() でSSR一覧を取り直す（お気に入り等と同方式）。
 */
export function MutesManager({ mutes }: { mutes: MuteEntryDto[] }) {
  const router = useRouter();
  const homeServer = useHomeServer();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemove = async (mutedUserId: string) => {
    if (removingId) return;
    setRemovingId(mutedUserId);
    try {
      const response = await fetch("/api/v1/mutes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mutedUserId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error?.message ?? "ミュート解除に失敗しました");
        return;
      }
      toast.success("ミュートを解除しました");
      router.refresh();
    } catch (error) {
      console.error("Mute remove error:", error);
      toast.error("ミュート解除に失敗しました");
    } finally {
      setRemovingId(null);
    }
  };

  if (mutes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">ミュート中のユーザーはいません。</p>
    );
  }

  return (
    <ul className="space-y-3">
      {mutes.map((mute) => {
        const seg = userPathSegment(mute.mutedUser.username, mute.mutedUser.domain, homeServer);
        const removing = removingId === mute.mutedUser.id;
        return (
          <li key={mute.id} className="bg-muted rounded-lg p-3 flex items-center gap-3">
            {mute.mutedUser.avatarUrl && (
              <RetryImg
                src={mute.mutedUser.avatarUrl}
                alt={mute.mutedUser.displayName || mute.mutedUser.username}
                className="w-9 h-9 rounded-full shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <Link
                href={`/u/${seg}`}
                className="text-sm font-medium truncate hover:underline block"
              >
                {mute.mutedUser.displayName || mute.mutedUser.username}
              </Link>
              <p className="text-[11px] text-muted-foreground truncate">
                @{mute.mutedUser.username}@{mute.mutedUser.domain}
              </p>
              <p className="text-[11px] text-muted-foreground">{expiryLabel(mute.expiresAt)}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => handleRemove(mute.mutedUser.id)}
              disabled={removing}
            >
              <VolumeX className="h-4 w-4 mr-1" />
              {removing ? "解除中..." : "解除"}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
