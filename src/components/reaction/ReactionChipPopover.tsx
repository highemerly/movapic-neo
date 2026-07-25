"use client";

import { useState } from "react";
import { SmilePlus, X } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { RetryImg } from "@/components/RetryImg";
import { ReactionEmojiView } from "./ReactionEmojiView";
import type { ReactionChipInfo, ReactionUserInfo } from "./reactionSync";

/**
 * リアクションチップ1個と、押したときにその場で開く「リアクションした人」ポップオーバー。
 *
 * モーダルではなくミートボールメニュー的にチップの隣へ出す（Misskey の流儀で、画像詳細には
 * 常時アバターを並べずここに畳む）。一覧はスリムに、末尾にこの画面からリアクションを追加する
 * 導線（＝アクションバーのリアクションボタン相当）も置く。
 */
export function ReactionChipPopover({
  chip,
  users,
  canReact,
  hasReacted,
  onReact,
  onRemove,
}: {
  chip: ReactionChipInfo;
  users: ReactionUserInfo[];
  canReact: boolean;
  /** 閲覧者が（別の絵文字で）既にこの投稿へリアクション済みか。文言を「変更する」に切り替える */
  hasReacted: boolean;
  /** ポップオーバー内の「リアクションする／変更する」導線。ピッカーを開く */
  onReact: () => void;
  /** このチップが閲覧者自身のリアクションのときの取り消し導線（確認モーダルを出す） */
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  // 上位40件までしかキャッシュしていないため、件数と一覧の長さは一致しないことがある
  const hidden = Math.max(0, chip.count - users.length);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] transition-colors ${
            chip.reactedByViewer
              ? "bg-brand/10 text-brand hover:bg-brand/15"
              : "bg-muted/60 text-muted-foreground hover:bg-muted"
          }`}
          title="リアクションした人を見る"
        >
          <ReactionEmojiView emoji={chip.emoji} imageUrl={chip.imageUrl} className="text-[15px]" />
          <span className="tabular-nums">{chip.count}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-60 p-2">
        <div className="mb-1.5 flex items-center gap-1 px-1 text-xs text-muted-foreground">
          <ReactionEmojiView emoji={chip.emoji} imageUrl={chip.imageUrl} className="text-[15px]" />
          <span className="tabular-nums">{chip.count}</span>
        </div>

        <ul className="max-h-[240px] space-y-0.5 overflow-y-auto">
          {users.map((user) => (
            <li key={user.acct}>
              <a
                href={user.profileUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                title={`@${user.acct}`}
                className="flex items-center gap-2 rounded p-1 transition-colors hover:bg-accent"
              >
                {user.avatarUrl ? (
                  <RetryImg
                    src={user.avatarUrl}
                    alt=""
                    className="h-6 w-6 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="h-6 w-6 shrink-0 rounded-full bg-muted" />
                )}
                <span className="min-w-0 flex-1 truncate text-xs">
                  {user.displayName || user.acct}
                </span>
              </a>
            </li>
          ))}
          {hidden > 0 && (
            <li className="px-1 py-0.5 text-xs text-muted-foreground">ほか{hidden}人</li>
          )}
        </ul>

        {canReact &&
          (chip.reactedByViewer ? (
            // このチップが自分のリアクション。取り消し（アクションバーと同じ確認モーダル）
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
            >
              <X className="h-3.5 w-3.5" />
              リアクションを取り消す
            </button>
          ) : (
            // 他人のリアクション。自分が別の絵文字で付けていれば「変更する」
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onReact();
              }}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <SmilePlus className="h-3.5 w-3.5" />
              {hasReacted ? "リアクションを変更する" : "リアクションする"}
            </button>
          ))}
      </PopoverContent>
    </Popover>
  );
}
