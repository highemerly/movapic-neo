"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
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

type Step = "idle" | "confirm" | "type";

/**
 * アカウント削除セクション。
 * 1回目のモーダルで注意事項を提示し OK/キャンセルを問う。
 * 2回目のモーダルで操作ミス防止の type to delete（アカウント名@サーバー名の完全一致）を要求する。
 * 削除は即時にDB側が反映されログアウトされる（R2画像の削除のみ裏で続行）。
 */
export function DeleteAccountSection({
  username,
  instanceDomain,
}: {
  username: string;
  instanceDomain: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [confirmName, setConfirmName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // 入力すべき文字列: アカウント名@サーバー名
  const requiredName = `${username}@${instanceDomain}`;
  const matched = confirmName.trim() === requiredName;

  const close = () => {
    if (isDeleting) return;
    setStep("idle");
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
      {/* トリガー行（「ログイン履歴を確認する」と同じデザイン） */}
      <button
        type="button"
        onClick={() => setStep("confirm")}
        className="w-full flex items-center justify-between gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm">アカウントを削除する</p>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      </button>

      <Dialog open={step !== "idle"} onOpenChange={(o) => !o && close()}>
        {step === "confirm" && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>アカウントを削除しますか？</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 text-left">
                  <p>
                    この操作は取り消せません。投稿した画像・実績・通知など、このサービス上のすべてのデータが完全に削除されます。
                  </p>
                  <p>
                    なお、Mastodon / Misskey
                    側に投稿済みの元投稿は削除されません（連携先のアカウントに残ります）。
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                キャンセル
              </Button>
              <Button variant="destructive" onClick={() => setStep("type")}>
                削除に進む
              </Button>
            </DialogFooter>
          </DialogContent>
        )}

        {step === "type" && (
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
        )}
      </Dialog>
    </>
  );
}
