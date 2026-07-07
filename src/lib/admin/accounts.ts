/**
 * /admin/accounts のユーザー一覧（ソート・オフセットページング）。
 *
 * 投稿数（count）・最終投稿日（max created_at）で並べ替えるため、ユーザー取得は raw SQL で
 * LEFT JOIN 集約する（Prisma の orderBy では関連の max 集約を並べ替えできないため）。
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { countRanks } from "@/lib/achievements/catalog";
import { PAGE_SIZE } from "@/app/admin/_components/query";

export type AccountSort =
  | "newest"
  | "oldest"
  | "posts_desc"
  | "posts_asc"
  | "lastpost_desc"
  | "lastpost_asc";

export function normalizeAccountSort(v: string | undefined): AccountSort {
  return v === "oldest" ||
    v === "posts_desc" ||
    v === "posts_asc" ||
    v === "lastpost_desc" ||
    v === "lastpost_asc"
    ? v
    : "newest";
}

// ORDER BY はホワイトリスト由来のみ Prisma.raw で埋める（ユーザー入力ではない）。
// 同点は登録日が新しい順で安定化。
const ORDER_BY: Record<AccountSort, Prisma.Sql> = {
  newest: Prisma.raw("u.created_at DESC"),
  oldest: Prisma.raw("u.created_at ASC"),
  posts_desc: Prisma.raw("post_count DESC, u.created_at DESC"),
  posts_asc: Prisma.raw("post_count ASC, u.created_at DESC"),
  // 降順(新しい順)は未投稿を末尾に、昇順(古い順)は未投稿(=最も古い扱い)を先頭に。
  lastpost_desc: Prisma.raw("last_post_at DESC NULLS LAST, u.created_at DESC"),
  lastpost_asc: Prisma.raw("last_post_at ASC NULLS FIRST, u.created_at DESC"),
};

export interface AccountRow {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  domain: string;
  instanceType: string;
  createdAt: Date;
  /** 最終投稿日（投稿ゼロなら null） */
  lastPostAt: Date | null;
  postCount: number;
  /** 獲得実績（金/銀ランク別） */
  gold: number;
  silver: number;
}

export interface AccountsResult {
  rows: AccountRow[];
  totalCount: number;
  page: number;
  totalPages: number;
}

export async function getAccounts(
  sort: AccountSort,
  page: number
): Promise<AccountsResult> {
  const [totalCount, users] = await Promise.all([
    prisma.user.count(),
    prisma.$queryRaw<
      {
        id: string;
        username: string;
        display_name: string | null;
        avatar_url: string | null;
        created_at: Date;
        domain: string;
        type: string;
        post_count: number;
        last_post_at: Date | null;
      }[]
    >(Prisma.sql`
      SELECT
        u.id,
        u.username,
        u.display_name,
        u.avatar_url,
        u.created_at,
        inst.domain,
        inst.type,
        count(i.id)::int AS post_count,
        max(i.created_at) AS last_post_at
      FROM users u
      JOIN instances inst ON inst.id = u.instance_id
      LEFT JOIN images i ON i.user_id = u.id
      GROUP BY u.id, inst.id
      ORDER BY ${ORDER_BY[sort]}
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
    `),
  ]);

  const ids = users.map((u) => u.id);
  // 実績（金/銀集計）はページ分のユーザーをまとめて1クエリで取る（N+1回避）。
  const achRows = ids.length
    ? await prisma.achievement.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, key: true, category: true },
      })
    : [];

  const achByUser = new Map<string, { key: string; category: string }[]>();
  for (const a of achRows) {
    const arr = achByUser.get(a.userId) ?? [];
    arr.push({ key: a.key, category: a.category });
    achByUser.set(a.userId, arr);
  }

  return {
    rows: users.map((u) => {
      const { gold, silver } = countRanks(achByUser.get(u.id) ?? []);
      return {
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        avatarUrl: u.avatar_url,
        domain: u.domain,
        instanceType: u.type,
        createdAt: u.created_at,
        lastPostAt: u.last_post_at,
        postCount: u.post_count,
        gold,
        silver,
      };
    }),
    totalCount,
    page,
    totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
  };
}
