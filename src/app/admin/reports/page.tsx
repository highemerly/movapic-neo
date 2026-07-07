/**
 * 管理ページ: 通報一覧（/admin/reports）
 *
 * 管理者ガードは admin/layout.tsx に集約。未対応（status: "open"）の通報を画像ごとに
 * まとめて表示し、各画像に対して「非表示にする」「削除する」「却下」を実行できる。
 * 「非表示中の投稿」一覧はオフセットページング（他の admin ページとデザイン共通化）。
 */

import Image from "next/image";
import Link from "@/components/Link";

import prisma from "@/lib/db";
import { getPublicUrl } from "@/lib/storage/storage";
import { userPathSegment } from "@/lib/userHandle";
import { ReportActions } from "./ReportActions";
import { Pagination } from "../_components/Pagination";
import { EmptyBox } from "../_components/ui";
import { normalizeParams, parsePage, PAGE_SIZE } from "../_components/query";

export const dynamic = "force-dynamic";

const BASE = "/admin/reports";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = normalizeParams(await searchParams);
  const page = parsePage(params.page);

  // 未対応の通報を新しい順に取得（画像・通報者・投稿者を含む）
  const reports = await prisma.report.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "desc" },
    include: {
      reporter: {
        select: { username: true, instance: { select: { domain: true } } },
      },
      image: {
        select: {
          id: true,
          overlayText: true,
          storageKey: true,
          thumbnailKey: true,
          isDisabled: true,
          createdAt: true,
          user: {
            select: { username: true, instance: { select: { domain: true } } },
          },
        },
      },
    },
  });

  // 画像ごとにグループ化
  const groups = new Map<
    string,
    {
      image: (typeof reports)[number]["image"];
      reports: { id: string; reason: string; createdAt: Date; reporterAcct: string }[];
    }
  >();
  for (const r of reports) {
    const g = groups.get(r.image.id) ?? { image: r.image, reports: [] };
    g.reports.push({
      id: r.id,
      reason: r.reason,
      createdAt: r.createdAt,
      // 表示用は省略しない完全形（username@domain）で明示する
      reporterAcct: `${r.reporter.username}@${r.reporter.instance.domain}`,
    });
    groups.set(r.image.id, g);
  }
  const grouped = [...groups.values()];

  // 非表示中の投稿（通報対応で非表示にしたもの）。未対応通報の一覧に既出のものは除外し、
  // 除外条件込みで件数を数えてページングする（ページ間で件数がぶれないように）。
  const groupIds = [...groups.keys()];
  const disabledWhere = { isDisabled: true, id: { notIn: groupIds } } as const;
  const [disabledTotal, disabledImages] = await Promise.all([
    prisma.image.count({ where: disabledWhere }),
    prisma.image.findMany({
      where: disabledWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        overlayText: true,
        storageKey: true,
        thumbnailKey: true,
        createdAt: true,
        user: {
          select: { username: true, instance: { select: { domain: true } } },
        },
      },
    }),
  ]);
  const disabledTotalPages = Math.max(1, Math.ceil(disabledTotal / PAGE_SIZE));

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">通報一覧</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        未対応の通報: {reports.length} 件（{grouped.length} 画像）
      </p>

      {grouped.length === 0 ? (
        <EmptyBox>未対応の通報はありません。</EmptyBox>
      ) : (
        <ul className="flex flex-col gap-4">
          {grouped.map((g) => {
            const seg = userPathSegment(
              g.image.user.username,
              g.image.user.instance.domain
            );
            const imagePath = `/u/${seg}/status/${g.image.id}`;
            const thumbUrl = getPublicUrl(
              g.image.thumbnailKey ?? g.image.storageKey
            );
            const ownerAcct = `${g.image.user.username}@${g.image.user.instance.domain}`;
            return (
              <li
                key={g.image.id}
                className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row"
              >
                <Link
                  href={imagePath}
                  className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-md bg-muted"
                  target="_blank"
                >
                  <Image
                    src={thumbUrl}
                    alt={g.image.overlayText}
                    fill
                    sizes="96px"
                    className="object-cover"
                    unoptimized
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  {/* 通報された投稿 */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        通報された投稿
                      </span>
                      {g.image.isDisabled && (
                        <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-600">
                          非表示中
                        </span>
                      )}
                    </div>
                    <dl className="grid grid-cols-[6em_1fr] gap-x-2 gap-y-0.5 text-sm">
                      <dt className="text-muted-foreground">アカウント</dt>
                      <dd className="min-w-0 break-all">
                        <Link
                          href={`/u/${seg}`}
                          target="_blank"
                          className="hover:underline"
                        >
                          @{ownerAcct}
                        </Link>
                      </dd>
                      <dt className="text-muted-foreground">投稿内容</dt>
                      <dd className="min-w-0 break-words">
                        <Link
                          href={imagePath}
                          target="_blank"
                          className="hover:underline"
                        >
                          {g.image.overlayText || "(本文なし)"}
                        </Link>
                      </dd>
                      <dt className="text-muted-foreground">投稿日</dt>
                      <dd>{g.image.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</dd>
                    </dl>
                  </div>

                  {/* この投稿への通報（複数あれば全部） */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">
                      通報（{g.reports.length}件）
                    </span>
                    <ul className="flex flex-col gap-1.5">
                      {g.reports.map((rep) => (
                        <li
                          key={rep.id}
                          className="rounded bg-muted/40 px-2.5 py-2"
                        >
                          <dl className="grid grid-cols-[6em_1fr] gap-x-2 gap-y-0.5 text-sm">
                            <dt className="text-muted-foreground">アカウント</dt>
                            <dd className="min-w-0 break-all">
                              @{rep.reporterAcct}
                            </dd>
                            <dt className="text-muted-foreground">コメント</dt>
                            <dd className="min-w-0 whitespace-pre-wrap break-words">
                              {rep.reason}
                            </dd>
                            <dt className="text-muted-foreground">通報日</dt>
                            <dd>{rep.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</dd>
                          </dl>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <ReportActions
                    imageId={g.image.id}
                    isDisabled={g.image.isDisabled}
                    mode="open"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 非表示中の投稿（通報対応で非表示にしたもの）。ここから削除・公開復帰ができる。 */}
      <section className="mt-10">
        <h2 className="mb-1 text-xl font-bold">非表示中の投稿</h2>
        <p className="mb-4 text-sm text-muted-foreground tabular-nums">
          現在非表示にしている投稿: {disabledTotal.toLocaleString("ja-JP")} 件
        </p>
        {disabledTotal === 0 ? (
          <EmptyBox>非表示中の投稿はありません。</EmptyBox>
        ) : (
          <ul className="flex flex-col gap-4">
            {disabledImages.map((img) => {
              const seg = userPathSegment(
                img.user.username,
                img.user.instance.domain
              );
              const imagePath = `/u/${seg}/status/${img.id}`;
              const thumbUrl = getPublicUrl(img.thumbnailKey ?? img.storageKey);
              const ownerAcct = `${img.user.username}@${img.user.instance.domain}`;
              return (
                <li
                  key={img.id}
                  className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row"
                >
                  <Link
                    href={imagePath}
                    target="_blank"
                    className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-md bg-muted opacity-60"
                  >
                    <Image
                      src={thumbUrl}
                      alt={img.overlayText}
                      fill
                      sizes="96px"
                      className="object-cover"
                      unoptimized
                    />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <dl className="grid grid-cols-[6em_1fr] gap-x-2 gap-y-0.5 text-sm">
                      <dt className="text-muted-foreground">アカウント</dt>
                      <dd className="min-w-0 break-all">
                        <Link
                          href={`/u/${seg}`}
                          target="_blank"
                          className="hover:underline"
                        >
                          @{ownerAcct}
                        </Link>
                      </dd>
                      <dt className="text-muted-foreground">投稿内容</dt>
                      <dd className="min-w-0 break-words">
                        <Link
                          href={imagePath}
                          target="_blank"
                          className="hover:underline"
                        >
                          {img.overlayText || "(本文なし)"}
                        </Link>
                      </dd>
                      <dt className="text-muted-foreground">投稿日</dt>
                      <dd>{img.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</dd>
                    </dl>
                    <ReportActions imageId={img.id} isDisabled mode="disabled" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination
          basePath={BASE}
          params={params}
          page={page}
          totalPages={disabledTotalPages}
          totalCount={disabledTotal}
        />
      </section>
    </>
  );
}
