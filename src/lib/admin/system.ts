/**
 * /admin/system のシステム情報。
 *
 * ソフトウェアのバージョン・DB/ストレージ容量を表示する読み取り専用ページ用。
 * 負荷を避けるため:
 *  - ライブラリのバージョンは実バケット/インストール走査ではなく、ビルド時に
 *    インライン化されるルート package.json の宣言値から取る（追加I/Oゼロ）。
 *    ※ sharp 等のサブパス package.json は exports マップ制限で import が壊れ得るので使わない。
 *  - Node と PostgreSQL は実行時の実値（process.version / SHOW server_version）。
 *  - ストレージ容量は ListObjectsV2 の全件走査を避け、DB の Image.file_size 合計で概算する
 *    （出力画像分のみ。サムネ・tmp は含まない）。
 */

import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";

// ルート package.json はビルド時に JSON がバンドルへインライン化される（実行時 I/O なし）。
import pkg from "../../../package.json";

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

/** package.json の依存宣言からバージョンを取り出し、範囲記号（^ ~ >= 等）を除いて返す。 */
function declared(name: string): string {
  const deps = pkg.dependencies as Record<string, string>;
  const devDeps = pkg.devDependencies as Record<string, string>;
  const raw = deps?.[name] ?? devDeps?.[name];
  if (!raw) return "不明";
  return raw.replace(/^[\^~>=<\s]+/, "");
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const [dbVersionRows, dbSizeRows, storageAgg] = await Promise.all([
    // 実行時の PostgreSQL サーバーバージョン（例: "16.4"）
    prisma.$queryRaw<{ server_version: string }[]>(Prisma.sql`SHOW server_version`),
    // 現在のデータベース全体のディスク使用量（内部カタログ参照・全走査ではない）
    prisma.$queryRaw<{ size: bigint }[]>(
      Prisma.sql`SELECT pg_database_size(current_database()) AS size`
    ),
    // 出力画像の総バイト数と件数（概算容量）
    prisma.image.aggregate({ _sum: { fileSize: true }, _count: true }),
  ]);

  // 環境によっては "17.5 (Debian ...)" のように付帯情報が付くので先頭の版番号だけ取る。
  const pgRaw = dbVersionRows[0]?.server_version ?? "";
  const pgVersion = pgRaw.match(/^\d+(\.\d+)*/)?.[0] ?? (pgRaw || "不明");
  const dbSizeBytes = Number(dbSizeRows[0]?.size ?? 0);

  const software: SoftwareItem[] = [
    { name: "SHAMEZO（本体）", version: pkg.version },
    { name: "Node.js", version: process.version.replace(/^v/, "") },
    { name: "Next.js", version: declared("next") },
    { name: "React", version: declared("react") },
    { name: "PostgreSQL", version: pgVersion },
    { name: "Prisma", version: declared("@prisma/client") },
    { name: "sharp（画像処理）", version: declared("sharp") },
    { name: "pg（DBドライバ）", version: declared("pg") },
    { name: "AWS SDK（S3）", version: declared("@aws-sdk/client-s3") },
  ];

  return {
    software,
    dbSizeBytes,
    storageApproxBytes: storageAgg._sum.fileSize ?? 0,
    imageCount: storageAgg._count,
  };
}
