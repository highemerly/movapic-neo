"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/providers/ConfirmProvider";

interface DeleteLocationButtonProps {
  imageId: string;
  /** 確認モーダルで「〜を削除します」と提示するための表示名（例: 千葉県流山市） */
  locationLabel: string;
}

export function DeleteLocationButton({ imageId, locationLabel }: DeleteLocationButtonProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (
      !(await confirm({
        title: "撮影場所を削除",
        description: `撮影場所「${locationLabel}」のみを削除し、写真は残します。元には戻せませんが、削除してよろしいですか？`,
        confirmText: "削除する",
        destructive: true,
      }))
    ) {
      return;
    }

    setIsDeleting(true);
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
      setIsDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="inline-flex items-center rounded p-0.5 text-muted-foreground transition-colors hover:text-red-600 disabled:opacity-50"
      title="撮影場所を削除"
      aria-label="撮影場所を削除"
    >
      <X className="h-3 w-3" />
    </button>
  );
}
