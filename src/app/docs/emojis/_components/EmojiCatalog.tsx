"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { RetryImg } from "@/components/RetryImg";
import type { ShamezoEmoji } from "@/lib/reactions/customEmoji";

/**
 * 公開カタログ（/docs/emojis）の本体。カテゴリ別セクション＋チップのグリッド。
 *
 * 一覧は「どんな絵文字があるか」を眺めるためのものなので、画像とショートコードだけを
 * チップに載せ、エイリアス・ライセンスはチップを押したときのポップオーバーに畳む
 * （画像詳細のリアクションチップと同じ流儀＝ReactionChipPopover）。
 * カテゴリの開閉は <details> に任せる（JSなしで動き、キーボード操作も標準のまま）。
 */
export function EmojiCatalog({
  sections,
}: {
  sections: { category: string; emojis: ShamezoEmoji[] }[];
}) {
  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <details
          key={section.category}
          open
          className="group rounded-lg border border-border"
        >
          {/* Safari は list-none だけでは ▶ が残るため ::-webkit-details-marker も消す */}
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            <span className="text-sm font-medium">{section.category}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {section.emojis.length}
            </span>
          </summary>
          <div className="grid grid-cols-2 gap-2 border-t border-border p-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {section.emojis.map((emoji) => (
              <EmojiChip key={emoji.name} emoji={emoji} />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function EmojiChip({ emoji }: { emoji: ShamezoEmoji }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left transition-colors hover:bg-muted"
          title={`${emoji.name} の詳細をみる`}
        >
          <RetryImg
            src={emoji.imageUrl}
            alt={emoji.name}
            className="h-6 w-6 shrink-0 object-contain"
          />
          <span className="min-w-0 flex-1 truncate text-xs">{emoji.name}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-64 p-3">
        <div className="flex items-center gap-2">
          <RetryImg
            src={emoji.imageUrl}
            alt={emoji.name}
            className="h-8 w-auto max-w-16 shrink-0 object-contain"
          />
          <span className="min-w-0 flex-1 break-all text-sm font-medium">
            {emoji.name}
          </span>
        </div>
        <dl className="mt-3 space-y-2 text-xs">
          {emoji.aliases.length > 0 && (
            <div>
              <dt className="text-muted-foreground">エイリアス</dt>
              <dd className="mt-0.5 break-words">{emoji.aliases.join(", ")}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">ライセンス</dt>
            <dd className="mt-0.5 break-words">
              {emoji.license ?? <span className="text-muted-foreground">記載なし</span>}
            </dd>
          </div>
        </dl>
      </PopoverContent>
    </Popover>
  );
}
