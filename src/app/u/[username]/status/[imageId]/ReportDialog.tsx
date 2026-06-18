"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const REASON_MIN = 2;
const REASON_MAX = 100;

interface ReportDialogProps {
  imageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 画像の通報ダイアログ。理由（2〜100文字）を入力して送信する。
 * 共通モーダル（useConfirm）はテキスト入力を持たないため、専用に用意している。
 */
export function ReportDialog({ imageId, open, onOpenChange }: ReportDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const trimmedLength = reason.trim().length;
  const isValid = trimmedLength >= REASON_MIN && trimmedLength <= REASON_MAX;

  const handleOpenChange = (next: boolean) => {
    if (submitting) return;
    if (!next) setReason("");
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/v1/images/${imageId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error?.message ?? "通報に失敗しました");
        return;
      }

      const data = await response.json().catch(() => ({}));
      toast.success(
        data.alreadyReported
          ? "この画像はすでに通報済みです"
          : "通報しました。ご協力ありがとうございます"
      );
      setReason("");
      onOpenChange(false);
    } catch (error) {
      console.error("Report error:", error);
      toast.error("通報に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="size-5 text-destructive" aria-hidden="true" />
            この画像を通報
          </DialogTitle>
          <DialogDescription>
            通報理由を{REASON_MIN}〜{REASON_MAX}文字で記入してください。通報は運営者が確認します。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={REASON_MAX}
            rows={4}
            placeholder="通報の理由を具体的に記入してください"
            disabled={submitting}
            autoFocus
          />
          <div className="text-right text-xs text-muted-foreground">
            {trimmedLength}/{REASON_MAX}
          </div>
        </div>

        <DialogFooter className="gap-3 sm:gap-[30px]">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 px-6 text-base sm:min-w-32 sm:flex-none"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-11 flex-1 px-6 text-base sm:min-w-32 sm:flex-none"
            onClick={handleSubmit}
            disabled={!isValid || submitting}
          >
            {submitting ? "送信中..." : "通報する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
