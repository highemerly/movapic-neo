"use client";

import { RetryImg } from "@/components/RetryImg";
import { isCustomEmojiKey, toDisplayEmoji } from "@/lib/reactions/emojiKey";

/**
 * リアクション1個の表示。
 *
 * - カスタム絵文字 … 画像（URLはメディアプロキシ経由で渡ってくる）。
 *   URLを解決できなかったものは :name: のテキストで見せる
 * - Unicode絵文字 … そのまま（正規化で落とした異体字セレクタは toDisplayEmoji が補う）。
 *   Fediverse のお気に入り（FAVOURITE_KEY=❤）もここに含まれる。
 */
export function ReactionEmojiView({
  emoji,
  imageUrl,
  className = "",
}: {
  emoji: string;
  imageUrl?: string | null;
  className?: string;
}) {
  if (isCustomEmojiKey(emoji)) {
    const name = emoji.slice(1, emoji.lastIndexOf("@"));
    if (!imageUrl) {
      return <span className={`shrink-0 text-[0.85em] ${className}`}>:{name}:</span>;
    }
    return (
      // pitfall: `inline` は必須。Tailwind の Preflight が img を display:block にするため、
      // 付けないと文中に混ぜたとき幅に関係なく画像の前後で必ず改行される（確認モーダルの
      // 「（絵文字）を取り消します。」など）。flex コンテナ内（チップ等）では子は
      // blockify されるので、付けても並びは変わらない。
      <RetryImg
        src={imageUrl}
        alt={`:${name}:`}
        className={`inline h-[1.3em] w-auto shrink-0 object-contain ${className}`}
      />
    );
  }

  return (
    <span className={`shrink-0 leading-none ${className}`}>{toDisplayEmoji(emoji)}</span>
  );
}
