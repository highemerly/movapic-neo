"use client";

import { RetryImg } from "@/components/RetryImg";
import { NOTIFICATION_ACTOR_LIMIT } from "@/lib/notifications/format";

export interface NotificationActor {
  acct: string;
  /** 代替テキスト・ツールチップ用の名前 */
  label: string;
  avatarUrl: string | null;
}

/**
 * 通知の2行目で、文の主語として先頭に置くアイコン（「👤👤 さんから…」）。
 *
 * FavoriterAvatars（幅を実測して詰める flex 部品）は使わない。あちらは残り幅いっぱいに広がるので、
 * 後ろに文を続けると文が右端へ押し出される。ここは数で打ち切ったインライン要素にして、文と一緒に
 * 折り返させる。行全体が既にリンクなので、プロフィールへのリンクは張らない（<a> の入れ子回避）。
 */
export function NotificationActors({ items }: { items: NotificationActor[] }) {
  const shown = items.slice(0, NOTIFICATION_ACTOR_LIMIT);
  return (
    <span className="mr-1 inline-flex items-center gap-0.5 align-middle">
      {shown.map((f) =>
        f.avatarUrl ? (
          <span key={f.acct} title={f.label} className="shrink-0">
            <RetryImg src={f.avatarUrl} alt={f.label} className="h-5 w-5 rounded-full" />
          </span>
        ) : (
          <span
            key={f.acct}
            title={f.label}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted-foreground/20 text-[10px]"
          >
            {f.label.charAt(0)}
          </span>
        )
      )}
      {items.length > shown.length && <span className="leading-none">…</span>}
    </span>
  );
}
