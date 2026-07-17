"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * アカウント削除の最終確認。
 * 注意事項は専用ページ（/settings/delete）側に常時表示し、
 * このコンポーネントは「削除に進む」ボタンと、操作ミス防止の
 * type to delete（アカウント名@サーバー名の完全一致）モーダルを担う。
 * 削除は即時にDB側が反映されログアウトされる（S3画像の削除のみ裏で続行）。
 */
export function DeleteAccountConfirm({
  username,
  instanceDomain,
}: {
  username: string;
  instanceDomain: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // 入力すべき文字列: アカウント名@サーバー名
  const requiredName = `${username}@${instanceDomain}`;
  const matched = confirmName.trim() === requiredName;

  const close = () => {
    if (isDeleting) return;
    setOpen(false);
    setConfirmName("");
  };

  const handleDelete = async () => {
    if (!matched || isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await fetch("/api/v1/me/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: confirmName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "アカウントの削除に失敗しました");
      }

      // この時点で DB のユーザーは削除済み・セッションcookieも破棄済み。
      // cookie(movapic_session)は httpOnly のためサーバー側で削除済みだが、
      // クライアントにしか無い localStorage/sessionStorage はここで一掃する
      // （テーマ・表示設定・直近ログインサーバー等をきれいさっぱり消す）。
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // プライベートモード等でストレージ不可でも削除処理は続行
      }

      // この時点で DB のユーザーは削除済み・ログアウト済み。トップへ戻す。
      toast.success(
        "アカウントを削除しました。またのご利用をお待ちしております。"
      );
      router.push("/");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "アカウントの削除に失敗しました"
      );
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Button
        variant="destructive"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        削除に進む
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader className="text-left">
            <DialogTitle>本当に削除しますか？</DialogTitle>
            <DialogDescription>
              誤操作防止のため、下のアカウント名を入力してください。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label
              htmlFor="confirm-account-name"
              className="block text-sm font-normal text-left leading-relaxed"
            >
              <span className="block">確認のため</span>
              <span className="block font-mono font-semibold text-foreground break-all">
                {requiredName}
              </span>
              <span className="block">を入力</span>
            </Label>
            <Input
              id="confirm-account-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={requiredName}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={isDeleting}
            />
          </div>

          <DialogFooter>
            <Button
              variant="destructive"
              className="w-full"
              disabled={!matched || isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? "削除中..." : "完全に削除する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
