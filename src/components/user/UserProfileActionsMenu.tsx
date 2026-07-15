"use client";

import { useState } from "react";
import { MoreHorizontal, VolumeX } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MuteDialog } from "@/components/mute/MuteDialog";

/**
 * ユーザーページ（各タブ共通ヘッダー）の「その他」操作メニュー（ミートボール）。
 * ログイン済みで本人でないときだけ表示し、いまはミュートの起点を提供する。
 * 解除は設定ページから行う（このメニューには置かない）。
 */
export function UserProfileActionsMenu({
  handle,
  targetLabel,
  isMuted = false,
}: {
  /** 対象ユーザーのハンドル（`username` or `username@domain`）。ミュートAPIへ渡す。 */
  handle: string;
  /** ダイアログ見出しに出す表示名。 */
  targetLabel?: string;
  /** 既にミュート中か。true のときは項目を「期間を変更」に変える（解除は設定から）。 */
  isMuted?: boolean;
}) {
  const [muteOpen, setMuteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="その他"
            title="その他"
            className="shrink-0 self-start -mr-1 p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px]">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setMuteOpen(true);
            }}
          >
            <VolumeX className="mr-2 h-4 w-4" />
            {isMuted ? "ミュートを変更・解除" : "このユーザーをミュート"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MuteDialog
        handle={handle}
        targetLabel={targetLabel}
        alreadyMuted={isMuted}
        open={muteOpen}
        onOpenChange={setMuteOpen}
      />
    </>
  );
}
