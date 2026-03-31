"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

interface DeleteButtonProps {
  imageId: string;
  username: string;
}

export function DeleteButton({ imageId, username }: DeleteButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("この画像を削除しますか？この操作は取り消せません。")) {
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

      router.push(`/u/${username}`);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "削除に失敗しました");
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
