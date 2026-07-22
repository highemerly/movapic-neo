"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/components/providers/ConfirmProvider";

/**
 * 写真から撮影場所（位置情報）を削除する共通ロジック。
 * インラインの X ボタン（DeleteLocationButton）とミートボールメニューの双方から使う。
 *
 * @param locationLabel 確認モーダルで「〜を削除します」と提示する表示名（例: 千葉県流山市）
 */
export function useDeleteLocation(imageId: string, locationLabel: string) {
  const router = useRouter();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);

  const remove = useCallback(async () => {
    if (
      !(await confirm({
        title: "撮影場所を削除",
        description: `写真から撮影場所「${locationLabel}」を削除します。元には戻せませんが、削除してよろしいですか？`,
        confirmText: "削除する",
        destructive: true,
      }))
    ) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/v1/images/${imageId}/location`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error?.message || data?.error || "削除に失敗しました");
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "削除に失敗しました");
      setDeleting(false);
    }
  }, [confirm, imageId, locationLabel, router]);

  return { deleting, remove };
}
