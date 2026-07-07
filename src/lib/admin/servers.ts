/**
 * /admin/servers のサーバー（連携インスタンス）一覧。
 * 旧 getServiceStats のインスタンス集計を、ソート・オフセットページング対応に一般化したもの。
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { PAGE_SIZE } from "@/app/admin/_components/query";

export type ServerSort = "users_desc" | "users_asc" | "posts_desc" | "posts_asc";

export function normalizeServerSort(v: string | undefined): ServerSort {
  return v === "users_asc" || v === "posts_desc" || v === "posts_asc"
    ? v
    : "users_desc";
}

// ORDER BY はホワイトリスト由来のみ Prisma.raw で埋める（ユーザー入力ではない）
const ORDER_BY: Record<ServerSort, Prisma.Sql> = {
  users_desc: Prisma.raw("users DESC, inst.domain ASC"),
  users_asc: Prisma.raw("users ASC, inst.domain ASC"),
  posts_desc: Prisma.raw("posts DESC, inst.domain ASC"),
  posts_asc: Prisma.raw("posts ASC, inst.domain ASC"),
};

export interface ServerRow {
  domain: string;
  type: string;
  users: number;
  posts: number;
  posts7d: number;
  newUsers7d: number;
}

export interface ServersResult {
  rows: ServerRow[];
  totalCount: number;
  page: number;
  totalPages: number;
}

export async function getServers(
  sort: ServerSort,
  page: number
): Promise<ServersResult> {
  const [countRow, rows] = await Promise.all([
    prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT count(*)::int AS count
      FROM instances inst
      WHERE EXISTS (SELECT 1 FROM users u WHERE u.instance_id = inst.id)
    `),
    // images は LEFT JOIN（投稿0のユーザーも数える）。ユーザー数は行膨張を避けて DISTINCT。
    prisma.$queryRaw<
      {
        domain: string;
        type: string;
        users: number;
        posts: number;
        posts_7d: number;
        new_users_7d: number;
      }[]
    >(Prisma.sql`
      SELECT
        inst.domain,
        inst.type,
        count(DISTINCT u.id)::int AS users,
        count(DISTINCT u.id) FILTER (WHERE u.created_at >= now() - interval '7 days')::int AS new_users_7d,
        count(i.id)::int AS posts,
        count(i.id) FILTER (WHERE i.created_at >= now() - interval '7 days')::int AS posts_7d
      FROM instances inst
      JOIN users u ON u.instance_id = inst.id
      LEFT JOIN images i ON i.user_id = u.id
      GROUP BY inst.domain, inst.type
      ORDER BY ${ORDER_BY[sort]}
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
    `),
  ]);

  const totalCount = countRow[0]?.count ?? 0;

  return {
    rows: rows.map((r) => ({
      domain: r.domain,
      type: r.type,
      users: r.users,
      posts: r.posts,
      posts7d: r.posts_7d,
      newUsers7d: r.new_users_7d,
    })),
    totalCount,
    page,
    totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
  };
}
