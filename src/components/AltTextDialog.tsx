"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// Mastodon の description 上限に合わせる（Misskey へは投稿時に512字へ切り詰め）。
const ALT_MAX_LENGTH = 1500;

interface AltTextDialogProps {
  open: boolean;
  /** 現在保存されている ALT（親が保持）。開くたびにこれを下書きの初期値にする。 */
  value: string;
  /** 参考表示用の画像URL（生成結果 or プレビュー）。null なら画像は出さない。 */
  previewUrl?: string | null;
  /** 保存ボタン押下時。トリムした文字列を親へ返す。 */
  onSave: (altText: string) => void;
  /** ダイアログを閉じるとき（キャンセル・×・オーバーレイ）。 */
  onClose: () => void;
}

/**
 * 画像の代替テキスト（ALT）を編集する Mastodon 風ダイアログ。
 * 下書きはローカル state に持ち、保存で初めて親へ反映する（キャンセルで破棄）。
 */
export function AltTextDialog({
  open,
  value,
  previewUrl,
  onSave,
  onClose,
}: AltTextDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* スマホではキーボードで入力欄が隠れないよう上寄せ＋高さ制限＋スクロール可能にする
          （デスクトップは中央のまま）。 */}
      <DialogContent className="top-4 max-h-[calc(100dvh-2rem)] translate-y-0 overflow-y-auto sm:top-1/2 sm:-translate-y-1/2">
        {/* 中身は open 中だけマウントされる（Radix が閉じるとアンマウント）。
            下書きの初期化を useState 初期値に任せられるので effect 不要。 */}
        {open && (
          <AltTextEditor
            value={value}
            previewUrl={previewUrl}
            onSave={onSave}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AltTextEditor({
  value,
  previewUrl,
  onSave,
  onClose,
}: Omit<AltTextDialogProps, "open">) {
  // 開いた瞬間の保存値を初期下書きにする（マウント時に1回だけ評価）。
  const [draft, setDraft] = useState(value);

  const handleSave = () => {
    onSave(draft.trim());
    onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>代替テキスト（ALT）</DialogTitle>
      </DialogHeader>

      {/* スマホは「小さいプレビュー＋説明文」を横並び（2段組）にして縦の圧迫を抑える。
          デスクトップは従来どおり縦積み（プレビュー大→説明）。 */}
      <div className="flex items-start gap-3 sm:block">
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            className="max-h-24 w-2/5 shrink-0 rounded-md border bg-muted object-contain sm:mb-2 sm:max-h-40 sm:w-full"
          />
        )}
        <DialogDescription>
          目の不自由な方のために、写真に写っているものを説明します。設定は任意です。
        </DialogDescription>
      </div>

      <div className="space-y-1">
        <Textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, ALT_MAX_LENGTH))}
          maxLength={ALT_MAX_LENGTH}
          rows={4}
          placeholder="例: 公園のベンチに座る茶色い猫"
        />
        <div className="text-right text-xs text-muted-foreground">
          {draft.length} / {ALT_MAX_LENGTH}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          キャンセル
        </Button>
        <Button type="button" onClick={handleSave}>
          保存
        </Button>
      </DialogFooter>
    </>
  );
}
