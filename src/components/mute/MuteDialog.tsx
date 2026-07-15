"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VolumeX, TriangleAlert } from "lucide-react";
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
import { SegmentControl } from "@/components/SegmentControl";
import {
  MUTE_DURATIONS,
  MUTE_DURATION_LABELS,
  type MuteDuration,
} from "@/lib/muteDurations";

interface MuteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ミュート対象のハンドル（`username` or `username@domain`）。API へそのまま渡す。 */
  handle: string;
  /** 見出しに出す対象の表示名（例: 表示名やハンドル）。未指定なら「このユーザー」。 */
  targetLabel?: string;
  /** 既にミュート中か。true のときは「期間を変更」の文言に切り替える（解除は設定から）。 */
  alreadyMuted?: boolean;
  /** ミュート成功後に呼ぶ（親側の再取得・バッジ更新用）。 */
  onMuted?: () => void;
}

/**
 * ユーザーミュートの期間選択ダイアログ。画像詳細・設定の双方から使う共通UI。
 * 相手には通知しない旨を明示する。解除は設定ページから行う。
 */
export function MuteDialog({
  open,
  onOpenChange,
  handle,
  targetLabel,
  alreadyMuted = false,
  onMuted,
}: MuteDialogProps) {
  const router = useRouter();
  const [duration, setDuration] = useState<MuteDuration>("7d");
  const [submitting, setSubmitting] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (submitting) return;
    if (!next) setDuration("7d");
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/mutes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, duration }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error?.message ?? "ミュートに失敗しました");
        return;
      }

      toast.success(alreadyMuted ? "ミュート期間を変更しました" : "ミュートしました");
      onMuted?.();
      setDuration("7d");
      onOpenChange(false);
      // ミュート状態はサーバーコンポーネント（バッジ・メニュー表示）が握るため、
      // 反映のためページのサーバーデータを取り直す（強制リロードは不要）。
      router.refresh();
    } catch (error) {
      console.error("Mute error:", error);
      toast.error("ミュートに失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnmute = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/mutes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error?.message ?? "ミュート解除に失敗しました");
        return;
      }

      toast.success("ミュートを解除しました");
      onMuted?.();
      setDuration("7d");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      console.error("Unmute error:", error);
      toast.error("ミュート解除に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <VolumeX className="size-5 shrink-0" aria-hidden="true" />
            {alreadyMuted
              ? "ミュートを変更"
              : targetLabel
                ? `${targetLabel}をミュート`
                : "このユーザーをミュート"}
          </DialogTitle>
          <DialogDescription>
            {alreadyMuted
              ? "ミュート期間を選び直すか、ミュートを解除できます。相手には通知されません。"
              : "このユーザーの投稿を非表示にします。相手には通知されません。"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">ミュート期間</span>
          <SegmentControl<MuteDuration>
            value={duration}
            options={[...MUTE_DURATIONS]}
            onChange={setDuration}
            size="xs"
            disabled={submitting}
            renderOption={(option) => MUTE_DURATION_LABELS[option]}
          />
          {/* 無期限は「解除し忘れ」で恒久化しやすいので、期間指定をそっと促す。 */}
          {duration === "indefinite" && (
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-500">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span>
                無期限は自分で解除するまでずっと続きます。まずは期間を決めるのがおすすめです。
              </span>
            </p>
          )}
        </div>

        <DialogFooter className="gap-3 sm:gap-[30px]">
          {/* ミュート中のときだけ、このダイアログから解除できる（左に隔離）。 */}
          {alreadyMuted && (
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 px-6 text-base text-destructive hover:text-destructive sm:min-w-32 sm:flex-none sm:mr-auto"
              onClick={handleUnmute}
              disabled={submitting}
            >
              ミュートを解除
            </Button>
          )}
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
            className="h-11 flex-1 px-6 text-base sm:min-w-32 sm:flex-none"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "処理中..." : alreadyMuted ? "変更する" : "ミュートする"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
