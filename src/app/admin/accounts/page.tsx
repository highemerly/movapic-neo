/**
 * 管理ページ: ユーザーアカウント一覧（/admin/accounts）
 *
 * 管理者ガードは admin/layout.tsx に集約。登録日・総投稿数でソートでき、オフセットページング。
 */

import Link from "@/components/Link";

import { getAvatarUrl } from "@/lib/avatar";
import { userPathSegment } from "@/lib/userHandle";
import { getAccounts, normalizeAccountSort } from "@/lib/admin/accounts";
import { InstanceLogo } from "../_components/InstanceLogo";
import { SortHeader } from "../_components/SortHeader";
import { Pagination } from "../_components/Pagination";
import { TableWrap, theadRowCls, fmtDate, EmptyBox } from "../_components/ui";
import { normalizeParams, parsePage } from "../_components/query";

export const dynamic = "force-dynamic";

const BASE = "/admin/accounts";

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = normalizeParams(await searchParams);
  const sort = normalizeAccountSort(params.sort);
  const page = parsePage(params.page);
  const { rows, totalCount, totalPages } = await getAccounts(sort, page);

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">アカウント一覧</h1>
      <p className="mb-6 text-sm text-muted-foreground tabular-nums">
        登録ユーザー {totalCount.toLocaleString("ja-JP")} 名。
      </p>

      {rows.length === 0 ? (
        <EmptyBox>ユーザーがいません。</EmptyBox>
      ) : (
        <TableWrap minWidth="40rem">
          <thead>
            <tr className={theadRowCls}>
              <th className="py-1.5 pr-3 text-left font-semibold" colSpan={2}>
                ユーザー
              </th>
              <th className="py-1.5 pr-3 text-left font-semibold">ID</th>
              <SortHeader
                basePath={BASE}
                params={params}
                current={sort}
                label="登録日"
                ascValue="oldest"
                descValue="newest"
                className="py-1.5 pr-3 text-right font-semibold"
              />
              <SortHeader
                basePath={BASE}
                params={params}
                current={sort}
                label="最終投稿"
                ascValue="lastpost_asc"
                descValue="lastpost_desc"
                className="py-1.5 pr-3 text-right font-semibold whitespace-nowrap"
              />
              <SortHeader
                basePath={BASE}
                params={params}
                current={sort}
                label="投稿"
                ascValue="posts_asc"
                descValue="posts_desc"
                className="py-1.5 pr-3 text-right font-semibold"
              />
              <th className="py-1.5 text-right font-semibold">実績（金/銀）</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((u) => {
              const seg = userPathSegment(u.username, u.domain);
              const avatar = getAvatarUrl(u.avatarUrl);
              return (
                <tr key={u.id} className="border-b border-border/50">
                  <td className="w-9 min-w-9 py-1.5">
                    <Link href={`/u/${seg}`} target="_blank" className="block">
                      {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatar}
                          alt=""
                          className="h-7 w-7 max-w-none shrink-0 rounded-full bg-muted object-cover"
                        />
                      ) : (
                        <span className="block h-7 w-7 shrink-0 rounded-full bg-muted" />
                      )}
                    </Link>
                  </td>
                  <td className="max-w-[12rem] truncate py-1.5 pr-3">
                    <Link href={`/u/${seg}`} target="_blank" className="hover:underline">
                      {u.displayName || u.username}
                    </Link>
                  </td>
                  <td className="max-w-[16rem] truncate py-1.5 pr-3 font-mono text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <InstanceLogo type={u.instanceType} />
                      <span className="truncate">
                        @{u.username}@{u.domain}
                      </span>
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right text-muted-foreground">
                    {fmtDate(u.createdAt)}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-muted-foreground">
                    {u.lastPostAt ? fmtDate(u.lastPostAt) : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-medium">
                    {u.postCount.toLocaleString("ja-JP")}
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    <span className="text-amber-500" title="金">
                      🥇{u.gold}
                    </span>{" "}
                    <span className="text-muted-foreground" title="銀">
                      🥈{u.silver}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      <Pagination
        basePath={BASE}
        params={params}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
      />
    </>
  );
}
