"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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

      // 削除成功後、ユーザーのギャラリーにリダイレクト
      router.push(`/${username}`);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "削除に失敗しました");
      setIsDeleting(false);
    }
  };

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleDelete}
      disabled={isDeleting}
    >
      {isDeleting ? "削除中..." : "この画像を削除"}
    </Button>
  );
}
