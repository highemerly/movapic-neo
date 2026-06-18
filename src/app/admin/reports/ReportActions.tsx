"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/providers/ConfirmProvider";

type ModerateAction = "disable" | "restore" | "delete" | "dismiss";

interface ReportActionsProps {
  imageId: string;
  isDisabled: boolean;
  /** open=通報一覧の行（非表示/却下を出す）, disabled=非表示中一覧の行（公開に戻すを出す） */
  mode: "open" | "disabled";
}

/** 通報一覧の各画像に対する管理者操作（非表示 / 公開に戻す / 削除 / 却下）。 */
export function ReportActions({ imageId, isDisabled, mode }: ReportActionsProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, setPending] = useState(false);

  const run = async (action: ModerateAction) => {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch(
        `/api/v1/admin/images/${imageId}/moderate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error?.message ?? "操作に失敗しました");
        return;
      }
      toast.success(
        action === "delete"
          ? "画像を削除しました"
          : action === "disable"
            ? "画像を非表示にしました"
            : action === "restore"
              ? "画像を公開に戻しました"
              : "通報を却下しました"
      );
      router.refresh();
    } catch (error) {
      console.error("Moderate error:", error);
      toast.error("操作に失敗しました");
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async () => {
    if (
      !(await confirm({
        title: "画像を削除",
        description: "この画像を完全に削除しますか？この操作は取り消せません。",
        confirmText: "削除する",
        destructive: true,
      }))
    ) {
      return;
    }
    run("delete");
  };

  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {!isDisabled && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run("disable")}
        >
          <EyeOff className="mr-1.5 h-4 w-4" />
          非表示にする
        </Button>
      )}
      {isDisabled && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run("restore")}
        >
          <Eye className="mr-1.5 h-4 w-4" />
          公開に戻す
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={handleDelete}
      >
        <Trash2 className="mr-1.5 h-4 w-4" />
        削除する
      </Button>
      {mode === "open" && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run("dismiss")}
        >
          <X className="mr-1.5 h-4 w-4" />
          却下
        </Button>
      )}
    </div>
  );
}
