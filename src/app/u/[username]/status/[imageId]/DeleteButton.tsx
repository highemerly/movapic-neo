"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/providers/ConfirmProvider";

interface DeleteButtonProps {
  imageId: string;
  username: string;
}

export function DeleteButton({ imageId, username }: DeleteButtonProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (
      !(await confirm({
        title: "画像を削除",
        description: "この画像を削除しますか？この操作は取り消せません。",
        confirmText: "削除する",
        destructive: true,
      }))
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/v1/images/${imageId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "削除に失敗しました");
      }

      // サービスからの削除は完了。Mastodonに投稿が残っている場合は、
      // 続けて「そちらも削除しますか？」を尋ねる。
      const data: {
        mastodonStatus?: { statusId: string; statusUrl: string | null } | null;
      } = await response.json().catch(() => ({}));

      let deletedMastodon = false;
      const mastodonStatus = data.mastodonStatus;
      if (mastodonStatus) {
        const deleteRemote = await confirm({
          title: "Mastodonの投稿も削除",
          description:
            "この画像はMastodonにも投稿されています。Mastodon側の投稿も削除しますか？",
          confirmText: "Mastodonからも削除",
          cancelText: "残しておく",
          destructive: true,
        });

        if (deleteRemote) {
          try {
            const remoteResponse = await fetch(
              "/api/v1/fediverse/delete-status",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ statusId: mastodonStatus.statusId }),
              }
            );
            if (!remoteResponse.ok) {
              const remoteData = await remoteResponse.json().catch(() => ({}));
              throw new Error(
                remoteData.error || "Mastodon投稿の削除に失敗しました"
              );
            }
            deletedMastodon = true;
          } catch (error) {
            // サービス側の画像は既に削除済みなので、ここでは通知のみ
            toast.error(
              error instanceof Error
                ? error.message
                : "Mastodon投稿の削除に失敗しました"
            );
          }
        }
      }

      // 成功トーストは遷移先のユーザーページで表示する（投稿完了時と同じ方式）。
      router.push(deletedMastodon ? `/u/${username}?deleted=mastodon` : `/u/${username}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "削除に失敗しました");
      setIsDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md transition-colors text-muted-foreground hover:text-red-600 hover:border-red-200 border-border disabled:opacity-50"
      title="この画像を削除"
    >
      <Trash2 className="h-4 w-4" />
      <span className="text-xs text-muted-foreground">削除</span>
    </button>
  );
}
