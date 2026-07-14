"use client";

import { useState } from "react";
import Link from "@/components/Link";
import { MastodonIcon } from "@/components/icons/MastodonIcon";
import { MisskeyIcon } from "@/components/icons/MisskeyIcon";
import {
  type PermissionItem,
  MASTODON_PERMISSIONS,
  MISSKEY_PERMISSIONS,
  MASTODON_WONT_DO,
  MISSKEY_WONT_DO,
  CANNOT_DO,
} from "@/lib/auth/permissions";

/**
 * 要求する権限（scope / permission）をMastodon / Misskeyのタブで切り替えて表示する本体。
 * ログイン画面の説明モーダル（PermissionInfoDialog）と /docs の「要求する権限」セクションで共有する。
 * 権限の文言は @/lib/auth/permissions に集約している。
 */

function PermissionList({ items }: { items: PermissionItem[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.scope} className="rounded-md border bg-muted/30 px-3 py-2">
          <code className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
            {item.scope}
          </code>
          <p className="mt-1 text-sm font-medium">{item.label}</p>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {item.usage}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** 「行いません／できません」の否定リスト（×印付き） */
function NegativeList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-1.5">
            <span aria-hidden className="mt-px text-destructive">×</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type TabKey = "mastodon" | "misskey";

const TABS: { id: TabKey; label: string; Icon: typeof MastodonIcon }[] = [
  { id: "mastodon", label: "Mastodon", Icon: MastodonIcon },
  { id: "misskey", label: "Misskey", Icon: MisskeyIcon },
];

export function PermissionTabs() {
  const [tab, setTab] = useState<TabKey>("mastodon");

  return (
    <div className="space-y-4">
      <div className="flex border-b-2 border-border">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? "border-b-2 border-primary text-primary bg-primary/5 -mb-[2px]"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "mastodon" ? (
        <PermissionList items={MASTODON_PERMISSIONS} />
      ) : (
        <PermissionList items={MISSKEY_PERMISSIONS} />
      )}

      {/* 行わないこと・できないこと（Mastodon / Misskey 共通） */}
      <div className="space-y-3 border-t pt-4">
        <NegativeList
          title="行いません"
          items={tab === "mastodon" ? MASTODON_WONT_DO : MISSKEY_WONT_DO}
        />
        <NegativeList title="権限を要求せず、技術的にできません" items={CANNOT_DO} />
      </div>

      {/* データの取り扱い */}
      <div className="rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground space-y-1">
        <p>取得したアクセストークンは暗号化して厳重に保管します。</p>
        <p>
          取得した個人情報は
          <Link href="/privacy" className="underline hover:text-foreground">
            プライバシーポリシー
          </Link>
          に則り適切に取り扱います。
        </p>
      </div>
    </div>
  );
}
