"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import Link from "@/components/Link";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MastodonIcon } from "@/components/icons/MastodonIcon";
import { MisskeyIcon } from "@/components/icons/MisskeyIcon";

/**
 * ログイン時に要求する権限（scope / permission）の説明モーダル。
 * MastodonとMisskeyでタブ切り替え。要求スコープは
 * src/lib/auth/fediverse.ts の実装と一致させること。
 */

interface PermissionItem {
  scope: string;
  label: string;
  usage: string;
}

// Mastodon: read write:statuses write:media write:favourites
const MASTODON_PERMISSIONS: PermissionItem[] = [
  {
    scope: "read",
    label: "アカウント情報の読み取り",
    usage: "ログインのほか、ユーザー名・アイコンの取得、重複投稿有無確認に必要。",
  },
  {
    scope: "write:statuses",
    label: "ポストの投稿・削除",
    usage:
      "ポストの投稿や削除に必要。",
  },
  {
    scope: "write:media",
    label: "画像のアップロード",
    usage: "画像投稿に必要。",
  },
  {
    scope: "write:favourites",
    label: "お気に入りの追加・削除",
    usage: "Web上でのお気に入り操作に必要。",
  },
];

// Misskey: read:account,write:notes,write:drive,write:reactions
const MISSKEY_PERMISSIONS: PermissionItem[] = [
  {
    scope: "read:account",
    label: "アカウント情報の読み取り",
    usage: "ログインのほか、ユーザー名・アイコンの取得に必要。",
  },
  {
    scope: "write:notes",
    label: "ノートの作成・削除",
    usage:
      "ノートの作成や削除に必要。",
  },
  {
    scope: "write:drive",
    label: "ドライブへの画像アップロード",
    usage: "画像つきノートの投稿時、あなたのドライブへ画像をアップロードするために必要。",
  },
  {
    scope: "write:reactions",
    label: "リアクションの追加・削除",
    usage: "Web上でのリアクション操作に必要。",
  },
];

// 技術的には可能だが、方針として行わない操作。
// read / write:statuses 等の広い権限で技術的には可能なため CANNOT_DO には入れられない。
// 「お気に入り／リアクション」の語はインスタンス種別で使い分ける。
const MASTODON_WONT_DO: string[] = [
  "タイムラインの読み取り",
  "あなたの操作によらない投稿・お気に入りの操作",
];
const MISSKEY_WONT_DO: string[] = [
  "タイムラインの読み取り",
  "あなたの操作によらない投稿・リアクションの操作",
];

// 要求スコープに含まれないため、技術的（トークンの権限）に不可能な操作（Mastodon / Misskey 共通）。
// ※フォロー閲覧・DM送受信は要求スコープ(read / write:statuses等)で技術的に可能なため含めない。
const CANNOT_DO: string[] = [
  "フォローする・フォロー解除する・ブロックする・ミュートする",
  "プロフィールを変更する",
  "パスワードをみる",
];

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

export function PermissionInfoDialog() {
  const [tab, setTab] = useState<TabKey>("mastodon");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-muted/30 px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <ShieldCheck className="size-3.5" />
          必要な権限は？
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>どんな権限を要求しますか？</DialogTitle>
          <DialogDescription>
            SHAMEZOは、あなたのアカウントに対し、以下の権限を要求します。
          </DialogDescription>
        </DialogHeader>

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

        {/* 最後まで読んだあと上までスクロールせず閉じられるよう、末尾にも閉じるボタンを置く */}
        <DialogClose asChild>
          <Button variant="outline" className="w-full">
            閉じる
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
