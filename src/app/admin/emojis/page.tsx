/**
 * 管理ページ: SHAMEZO 独自カスタム絵文字（/admin/emojis）
 *
 * Mastodon ユーザーがリアクションで使える独自絵文字を管理者が登録する。
 * Misskey ユーザーは自サーバーの絵文字を使うため対象外（docs/favorite.md 参照）。
 * 管理者ガードは admin/layout.tsx に集約。
 */

import prisma from "@/lib/db";
import { EmojiManager, type AdminEmoji } from "./EmojiManager";

export const dynamic = "force-dynamic";

export default async function AdminEmojisPage() {
  const rows = await prisma.customEmoji.findMany({
    orderBy: [{ enabled: "desc" }, { category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      imageUrl: true,
      category: true,
      aliases: true,
      license: true,
      enabled: true,
      createdById: true,
      createdAt: true,
    },
  });
  const initial: AdminEmoji[] = rows.map((e) => ({
    ...e,
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">カスタム絵文字</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mastodon ユーザーがリアクションで使える独自絵文字です（横長・アニメーション可）。
        </p>
      </div>
      <EmojiManager initial={initial} />
    </div>
  );
}
