/**
 * 管理ページ: 通報一覧（/admin/reports）
 *
 * 管理者（ADMIN_ACCTS）のみ閲覧可。非管理者には 404 を返す。
 * 未対応（status: "open"）の通報を画像ごとにまとめて表示し、各画像に対して
 * 「非表示にする」「削除する」「却下」を実行できる。
 */

import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "@/components/Link";

import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import prisma from "@/lib/db";
import { getPublicUrl } from "@/lib/storage/storage";
import { userPathSegment } from "@/lib/userHandle";
import { ReportActions } from "./ReportActions";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const currentUser = await getCurrentUser();
  const acct = currentUser
    ? `${currentUser.username}@${currentUser.instance.domain}`
    : null;
  if (!isAdmin(acct)) {
    notFound();
  }

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

  // 非表示中の投稿（通報対応で非表示にしたもの）。未対応通報の一覧に既出のものは除外。
  const disabledImages = (
    await prisma.image.findMany({
      where: { isDisabled: true },
      orderBy: { createdAt: "desc" },
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
    })
  ).filter((img) => !groups.has(img.id));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">通報一覧</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        未対応の通報: {reports.length} 件（{grouped.length} 画像）
      </p>

      {grouped.length === 0 ? (
        <p className="rounded-md border border-border bg-muted/30 px-4 py-8 text-center text-muted-foreground">
          未対応の通報はありません。
        </p>
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
                      <dd>{g.image.createdAt.toLocaleString("ja-JP")}</dd>
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
                            <dd>{rep.createdAt.toLocaleString("ja-JP")}</dd>
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
        <p className="mb-4 text-sm text-muted-foreground">
          現在非表示にしている投稿: {disabledImages.length} 件
        </p>
        {disabledImages.length === 0 ? (
          <p className="rounded-md border border-border bg-muted/30 px-4 py-8 text-center text-muted-foreground">
            非表示中の投稿はありません。
          </p>
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
                      <dd>{img.createdAt.toLocaleString("ja-JP")}</dd>
                    </dl>
                    <ReportActions imageId={img.id} isDisabled mode="disabled" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
