/**
 * /admin/system のシステム情報。
 *
 * ソフトウェアのバージョン・DB/ストレージ容量を表示する読み取り専用ページ用。
 * バージョンはすべて実際に動いている値を出す:
 *  - ライブラリは各パッケージの package.json（ビルド時にバンドルへインライン化＝実行時 I/O なし）。
 *    pitfall: 以前はルート package.json の宣言値（"^7.4.2" の範囲の下限）を出しており、実際に
 *    入っている版とずれていた（Prisma 7.4.2 表示で実体 7.10.0 など）。対象の各パッケージは
 *    exports に ./package.json を公開している（2026-10-15 確認。next は version.ts と同じ読み方）。
 *  - Node と PostgreSQL は実行時の実値（process.version / SHOW server_version）。
 *  - sharp / libvips は画像処理を担う compute が実際に読み込んでいる値（health.ts 経由）。
 *  - ストレージ容量は ListObjectsV2 の全件走査を避け、DB の Image.file_size 合計で概算する
 *    （出力画像分のみ。サムネ・tmp は含まない）。
 */

import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";

// package.json はビルド時に JSON がバンドルへインライン化される（実行時 I/O なし）。
import pkg from "../../../package.json";
import nextPkg from "next/package.json";
import reactPkg from "react/package.json";
import prismaClientPkg from "@prisma/client/package.json";
import pgPkg from "pg/package.json";
import s3Pkg from "@aws-sdk/client-s3/package.json";
import { getComputeImageLibVersions } from "@/lib/admin/health";

export interface SoftwareItem {
  name: string;
  version: string;
  note?: string;
}

export interface SystemInfo {
  /** バージョン一覧（アプリ→ランタイム→主要ライブラリの順） */
  software: SoftwareItem[];
  /** DB 容量（実測） */
  dbSizeBytes: number;
  /** ストレージ概算容量（Image.file_size 合計） */
  storageApproxBytes: number;
  /** 保存画像数 */
  imageCount: number;
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const [dbVersionRows, dbSizeRows, storageAgg, imageLibs] = await Promise.all([
    // 実行時の PostgreSQL サーバーバージョン（例: "16.4"）
    prisma.$queryRaw<{ server_version: string }[]>(Prisma.sql`SHOW server_version`),
    // 現在のデータベース全体のディスク使用量（内部カタログ参照・全走査ではない）
    prisma.$queryRaw<{ size: bigint }[]>(
      Prisma.sql`SELECT pg_database_size(current_database()) AS size`
    ),
    // 出力画像の総バイト数と件数（概算容量）
    prisma.image.aggregate({ _sum: { fileSize: true }, _count: true }),
    getComputeImageLibVersions(),
  ]);

  // 環境によっては "17.5 (Debian ...)" のように付帯情報が付くので先頭の版番号だけ取る。
  const pgRaw = dbVersionRows[0]?.server_version ?? "";
  const pgVersion = pgRaw.match(/^\d+(\.\d+)*/)?.[0] ?? (pgRaw || "不明");
  const dbSizeBytes = Number(dbSizeRows[0]?.size ?? 0);

  const software: SoftwareItem[] = [
    { name: "SHAMEZO（本体）", version: pkg.version },
    { name: "Node.js", version: process.version.replace(/^v/, "") },
    { name: "Next.js", version: nextPkg.version },
    { name: "React", version: reactPkg.version },
    { name: "PostgreSQL", version: pgVersion },
    { name: "Prisma", version: prismaClientPkg.version },
    { name: "sharp（画像処理）", version: imageLibs?.sharp ?? "取得できません" },
    { name: "libvips（画像処理）", version: imageLibs?.vips ?? "取得できません" },
    { name: "pg（DBドライバ）", version: pgPkg.version },
    { name: "AWS SDK（S3）", version: s3Pkg.version },
  ];

  return {
    software,
    dbSizeBytes,
    storageApproxBytes: storageAgg._sum.fileSize ?? 0,
    imageCount: storageAgg._count,
  };
}
