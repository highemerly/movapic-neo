"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pin, Trash2, Flag, Share, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { ReportDialog } from "./ReportDialog";
import { useNativeShare, type NativeShareParams } from "./useNativeShare";

interface ImageActionsMenuProps {
  imageId: string;
  username: string;
  isOwner: boolean;
  initialIsPinned: boolean;
  /** 通報可能か（ログイン済み かつ 自分の画像でない） */
  canReport: boolean;
  /** トリガー（ミートボール）に足すクラス（非ログイン時に狭い画面のみ表示する等） */
  triggerClassName?: string;
  /** 狭い画面でメニュー内に出すネイティブ共有（広い画面では行内のボタンが担当） */
  nativeShare?: NativeShareParams;
}

/**
 * 画像詳細ページの「その他」操作メニュー（ミートボール）。
 * 投稿者向けの「ピン留め」「削除」と、将来追加予定の「通報」を格納する。
 * 通報は全ユーザー向けの機能になるため、メニュー自体は誰にでも表示する。
 */
export function ImageActionsMenu({
  imageId,
  username,
  isOwner,
  initialIsPinned,
  canReport,
  triggerClassName,
  nativeShare,
}: ImageActionsMenuProps) {
  const router = useRouter();
  const confirm = useConfirm();
  // フックは常に呼ぶ（nativeShare 未指定時はダミー値。visible 判定で出し分け）
  const native = useNativeShare(
    nativeShare ?? { imageUrl: "", mimeType: "", fileBaseName: "", text: "", url: "" }
  );
  const [isPinned, setIsPinned] = useState(initialIsPinned);
  const [isPinning, setIsPinning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSettingThumb, setIsSettingThumb] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // ① その日のカレンダーサムネイルにこの写真を指定する。
  const handleSetThumbnail = useCallback(async () => {
    if (isSettingThumb) return;
    setIsSettingThumb(true);
    try {
      const response = await fetch(`/api/v1/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarPicked: true }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "サムネイルの設定に失敗しました");
        return;
      }
      toast.success("この日のカレンダーサムネイルにしました");
    } catch (error) {
      console.error("Set thumbnail error:", error);
      toast.error("サムネイルの設定に失敗しました");
    } finally {
      setIsSettingThumb(false);
    }
  }, [imageId, isSettingThumb]);

  const handlePin = useCallback(async () => {
    if (isPinning) return;
    const wasPinned = isPinned;

    // Optimistic update
    setIsPinned(!wasPinned);
    setIsPinning(true);
    try {
      const response = await fetch(`/api/v1/images/${imageId}/pin`, {
        method: wasPinned ? "DELETE" : "POST",
      });

      if (!response.ok) {
        setIsPinned(wasPinned);
        const data = await response.json().catch(() => ({}));
        toast.error(data.error?.message ?? "ピン留めの操作に失敗しました");
        return;
      }

      toast.success(wasPinned ? "ピン留めを解除しました" : "ピン留めしました");
    } catch (error) {
      setIsPinned(wasPinned);
      console.error("Pin error:", error);
      toast.error("ピン留めの操作に失敗しました");
    } finally {
      setIsPinning(false);
    }
  }, [imageId, isPinning, isPinned]);

  const handleDelete = useCallback(async () => {
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

      // サービスからの削除は完了。連携先（Mastodon/Misskey）に投稿が残っている場合は、
      // 続けて「そちらも削除しますか？」を尋ねる。
      const data: {
        remoteStatus?: {
          statusId: string;
          statusUrl: string | null;
          platform: "mastodon" | "misskey";
        } | null;
      } = await response.json().catch(() => ({}));

      let deletedRemote = false;
      const remoteStatus = data.remoteStatus;
      if (remoteStatus) {
        const platformName =
          remoteStatus.platform === "misskey" ? "Misskey" : "Mastodon";
        const deleteRemote = await confirm({
          title: `${platformName}の投稿も削除`,
          description: `この画像は${platformName}にも投稿されています。${platformName}側の投稿も削除しますか？`,
          confirmText: `${platformName}からも削除`,
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
                body: JSON.stringify({ statusId: remoteStatus.statusId }),
              }
            );
            if (!remoteResponse.ok) {
              const remoteData = await remoteResponse.json().catch(() => ({}));
              throw new Error(
                remoteData.error || `${platformName}投稿の削除に失敗しました`
              );
            }
            deletedRemote = true;
          } catch (error) {
            // サービス側の画像は既に削除済みなので、ここでは通知のみ
            toast.error(
              error instanceof Error
                ? error.message
                : `${platformName}投稿の削除に失敗しました`
            );
          }
        }
      }

      // 成功トーストは遷移先のユーザーページで表示する（投稿完了時と同じ方式）。
      router.push(
        deletedRemote
          ? `/u/${username}?deleted=remote`
          : `/u/${username}?deleted=1`
      );
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "削除に失敗しました");
      setIsDeleting(false);
    }
  }, [confirm, imageId, router, username]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex shrink-0 items-center justify-center h-[40px] w-[40px] border rounded-md transition-colors text-muted-foreground hover:text-foreground border-border ${triggerClassName ?? ""}`}
          title="その他"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {/* ネイティブ共有は狭い画面だけメニュー内に出す（広い画面は行内のボタンが担当） */}
        {nativeShare && native.visible && (
          <DropdownMenuItem
            className="min-[380px]:hidden"
            onSelect={(e) => {
              e.preventDefault();
              native.share();
            }}
          >
            <Share className="mr-2 h-4 w-4" />
            他のアプリで共有
          </DropdownMenuItem>
        )}
        {isOwner && (
          <>
            <DropdownMenuItem
              disabled={isSettingThumb}
              onSelect={(e) => {
                e.preventDefault();
                handleSetThumbnail();
              }}
            >
              <ImageIcon className="mr-2 h-4 w-4" />
              この日のサムネイルにする
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isPinning}
              onSelect={(e) => {
                e.preventDefault();
                handlePin();
              }}
            >
              <Pin
                className={`mr-2 h-4 w-4 ${
                  isPinned ? "fill-current text-amber-500" : ""
                }`}
              />
              {isPinned ? "ピン留めを解除" : "ピン留め"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isDeleting}
              className="text-red-600 focus:text-red-600"
              onSelect={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              削除
            </DropdownMenuItem>
          </>
        )}
        {/* 通報は全ユーザー向け（自分の画像/未ログイン時は非表示）。 */}
        {canReport && (
          <DropdownMenuItem
            className="text-red-600 focus:text-red-600"
            onSelect={(e) => {
              e.preventDefault();
              setReportOpen(true);
            }}
          >
            <Flag className="mr-2 h-4 w-4" />
            通報
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
      {canReport && (
        <ReportDialog
          imageId={imageId}
          open={reportOpen}
          onOpenChange={setReportOpen}
        />
      )}
    </DropdownMenu>
  );
}
