"use client";

import { useState } from "react";
import { ArrowLeftRight, Plus, X } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { RetryImg } from "@/components/RetryImg";
import { ReactionEmojiView } from "./ReactionEmojiView";
import {
  canViewerReactWith,
  viewerReactBlockedReason,
} from "@/lib/reactions/emojiKey";
import type { ReactionChipInfo, ReactionUserInfo } from "./reactionSync";

/**
 * リアクションチップ1個と、押したときにその場で開く「リアクションした人」ポップオーバー。
 *
 * モーダルではなくミートボールメニュー的にチップの隣へ出す（Misskey の流儀で、画像詳細には
 * 常時アバターを並べずここに畳む）。一覧はスリムに、末尾にこのチップと同じリアクションを付け直す
 * 導線を置く（ピッカーは開かず、そのチップの絵文字をそのまま送る）。
 */
export function ReactionChipPopover({
  chip,
  users,
  canReact,
  hasReacted,
  viewerType,
  viewerDomain,
  onReactSame,
  onRemove,
}: {
  chip: ReactionChipInfo;
  users: ReactionUserInfo[];
  canReact: boolean;
  /** 閲覧者が（別の絵文字で）既にこの投稿へリアクション済みか。文言を「変更する」に切り替える */
  hasReacted: boolean;
  /** 閲覧者のインスタンス種別／ドメイン。同じ絵文字を送れるかの厳密判定に使う（未ログインは null） */
  viewerType: "mastodon" | "misskey" | null;
  viewerDomain: string | null;
  /** このチップと同じ絵文字でリアクションする導線（ピッカーは開かず chip.emoji をそのまま送る） */
  onReactSame: () => void;
  /** このチップが閲覧者自身のリアクションのときの取り消し導線（確認モーダルを出す） */
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  // 上位40件までしかキャッシュしていないため、件数と一覧の長さは一致しないことがある
  const hidden = Math.max(0, chip.count - users.length);

  // 閲覧者がこのチップと「同じ」絵文字を送れるか（サーバー違い・カスタム絵文字などを厳密に判定）。
  // 送れないケース（他サーバーのカスタム絵文字／Mastodonからのカスタム絵文字など）は導線を出さない。
  const canReactSame =
    canReact &&
    !!viewerType &&
    !!viewerDomain &&
    canViewerReactWith(chip.emoji, viewerType, viewerDomain);

  // 押せない理由。導線を出さないだけだと不具合に見えるので一言添える。ただし絵文字のせいで
  // 押せないケースに限る（未ログイン・投稿削除ずみ等は絵文字の問題ではないので何も出さない）。
  const blockedReason =
    canReact && viewerType && viewerDomain
      ? viewerReactBlockedReason(chip.emoji, viewerType, viewerDomain)
      : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // 自分が付けたチップは primary で塗りつぶす。他のチップ（グレー地に muted 文字）とは
          // 地と文字が反転する関係になるので、絵文字を読まなくても一目で自分のものが分かる。
          // brand（ピンク）は主役CTA専用なので、こういう状態表示には使わない。
          //
          // 他人のチップの地は muted ではなく foreground の半透明にする。ライトの --muted(0.97) は
          // 背景の白(1.0)とほぼ同色で、地が無いのと同じ＝淡い色のカスタム絵文字が沈むため。
          // foreground 基準なら明暗どちらでも背景から一定量ずれる（ダークでの見えかたは従来と同等）。
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
            chip.reactedByViewer
              ? "bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
              : "bg-foreground/10 text-muted-foreground hover:bg-foreground/20"
          }`}
          title="リアクションした人を見る"
        >
          <ReactionEmojiView emoji={chip.emoji} imageUrl={chip.imageUrl} className="text-[18px]" />
          <span className="tabular-nums">{chip.count}</span>
        </button>
      </PopoverTrigger>

      {/* Radix は開いた直後、中の最初のタブ可能要素（＝末尾の「取り消す／変更する」ボタン。
          プロフィールURLが無いユーザーはリンクが href 無し＝タブ不可のため先頭になりやすい）へ
          フォーカスを移す。iOS Safari はそこに既定のフォーカス枠を描き、押下待ちのように見えてしまう
          （Chrome は :focus-visible の判定が異なり出ない）。フォーカス自体はコンテナへ移しておく
          ことで、枠は出さずにキーボードから Tab で中の項目へ入れる状態は保つ
          （コンテナは popover.tsx 側で outline-hidden 済み）。 */}
      <PopoverContent
        align="start"
        className="w-60 p-2"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const content = event.currentTarget;
          if (content instanceof HTMLElement) content.focus();
        }}
      >
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

        {chip.reactedByViewer ? (
          // このチップが自分のリアクション。取り消し（＋ボタンからの取り消しと同じ確認モーダル）。
          // canReact でなくても自分の付けたものは取り消せてよいが、取り消しも Fediverse 送信を伴うため
          // canReact に合わせる（deleted 等では非表示）。
          canReact && (
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
          )
        ) : !canReactSame ? (
          // 送れない絵文字（他サーバーのカスタム絵文字／Mastodonからのカスタム絵文字など）は
          // 導線の代わりに理由を出す。何も出さないと押せないことが不具合に見えるため。
          blockedReason && (
            <p className="mt-1.5 px-1 text-[11px] leading-snug text-muted-foreground/80">
              {blockedReason}
            </p>
          )
        ) : (
          // 他人のリアクションで、かつ送れる絵文字。ピッカーは開かず、このチップと同じ絵文字を
          // そのまま送る。自分が別の絵文字で付けていれば「変更」、未リアクションなら「同じリアクション」。
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onReactSame();
            }}
            // ポップオーバー内の主たる操作なので primary の塗りボタンにする（枠線のみの
            // 「取り消す」より前に出す）。brand はCTA専用なのでここでは使わない。
            className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {/* どの絵文字かは真上のチップに出ているので、ここは操作の種類（付け替え／追加）だけ示す。 */}
            {hasReacted ? (
              <ArrowLeftRight className="h-3.5 w-3.5" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {hasReacted ? "このリアクションに変更する" : "このリアクションをする"}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
