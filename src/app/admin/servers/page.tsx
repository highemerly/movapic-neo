/**
 * 管理ページ: サーバー（連携インスタンス）一覧（/admin/servers）
 *
 * 管理者ガードは admin/layout.tsx に集約。ユーザー数・総投稿数でソートでき、オフセットページング。
 * 旧 /admin/stats の「サーバー別」表を移設したもの。サーバートップへの外部リンク付き。
 */

import { getServers, normalizeServerSort } from "@/lib/admin/servers";
import { InstanceLogo } from "../_components/InstanceLogo";
import { SortHeader } from "../_components/SortHeader";
import { Pagination } from "../_components/Pagination";
import { TableWrap, theadRowCls, EmptyBox } from "../_components/ui";
import { normalizeParams, parsePage } from "../_components/query";

export const dynamic = "force-dynamic";

const BASE = "/admin/servers";

export default async function AdminServersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = normalizeParams(await searchParams);
  const sort = normalizeServerSort(params.sort);
  const page = parsePage(params.page);
  const { rows, totalCount, totalPages } = await getServers(sort, page);

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">サーバー一覧</h1>
      <p className="mb-6 text-sm text-muted-foreground tabular-nums">
        連携サーバー {totalCount.toLocaleString("ja-JP")} 件。
      </p>

      {rows.length === 0 ? (
        <EmptyBox>サーバーがありません。</EmptyBox>
      ) : (
        <TableWrap minWidth="38rem">
          <thead>
            <tr className={theadRowCls}>
              <th className="py-1.5 pr-3 text-left font-semibold" colSpan={2}>
                サーバー
              </th>
              <SortHeader
                basePath={BASE}
                params={params}
                current={sort}
                label="ユーザー"
                ascValue="users_asc"
                descValue="users_desc"
                className="py-1.5 pr-3 text-right font-semibold"
              />
              <SortHeader
                basePath={BASE}
                params={params}
                current={sort}
                label="総投稿"
                ascValue="posts_asc"
                descValue="posts_desc"
                className="py-1.5 pr-3 text-right font-semibold"
              />
              <th className="py-1.5 pr-3 text-right font-semibold">7日投稿</th>
              <th className="py-1.5 text-right font-semibold">7日新規</th>
            </tr>
          </thead>
          <tbody className="text-right tabular-nums">
            {rows.map((s) => (
              <tr key={s.domain} className="border-b border-border/50">
                <td className="w-6 py-1.5 pr-2">
                  <InstanceLogo type={s.type} />
                </td>
                <td className="break-all py-1.5 pr-3 text-left font-mono">
                  <a
                    href={`https://${s.domain}`}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="hover:underline"
                  >
                    {s.domain}
                  </a>
                </td>
                <td className="py-1.5 pr-3 font-medium">
                  {s.users.toLocaleString("ja-JP")}
                </td>
                <td className="py-1.5 pr-3">{s.posts.toLocaleString("ja-JP")}</td>
                <td className="py-1.5 pr-3">{s.posts7d.toLocaleString("ja-JP")}</td>
                <td className="py-1.5">{s.newUsers7d.toLocaleString("ja-JP")}</td>
              </tr>
            ))}
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
