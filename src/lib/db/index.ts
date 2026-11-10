import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/**
 * 既定では読まない列。必要な箇所だけ `select` で明示して読む。
 * Instance.emojisCache は Misskey の絵文字一覧で、大規模インスタンスでは数MB（misskey.io で約3MB）。
 * pitfall: 以前はセッション・ユーザーページ・リアクションなど `include: { instance: true }` の
 * すべてでこの列まで転送・JSONパースしていた（読むのは src/lib/fediverse/emojis.ts だけ）。
 * 呼び出し側ごとに select で絞ると新しい include で漏れるため、クライアント全体で外す。
 */
export const GLOBAL_OMIT = {
  instance: { emojisCache: true },
} as const;

type AppPrismaClient = PrismaClient<{ omit: typeof GLOBAL_OMIT }>;

/**
 * Prisma.XxxGetPayload で手書きする型はクライアント全体の omit を知らないため、
 * Instance を含む型はこれを使う（`{ include: { instance: { omit: InstanceOmit } } }`）。
 */
export type InstanceOmit = typeof GLOBAL_OMIT.instance;

const globalForPrisma = globalThis as unknown as {
  prisma: AppPrismaClient | undefined;
  pool: Pool | undefined;
};

// ビルド時かどうかを判定（ダミーURLの場合はビルド時）
function isBuildTime(): boolean {
  const url = process.env.DATABASE_URL;
  return !url || url.includes("dummy");
}

function createPrismaClient(): AppPrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = globalForPrisma.pool ?? new Pool({ connectionString });
  globalForPrisma.pool = pool;

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    omit: GLOBAL_OMIT,
  });
}

function getPrismaClient(): AppPrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

// Use a Proxy to defer client creation until first access
// This allows the module to be imported during build without DATABASE_URL
export const prisma = new Proxy({} as AppPrismaClient, {
  get(_target, prop: string | symbol) {
    // ビルド時はダミーの結果を返す
    if (isBuildTime()) {
      // findMany等のメソッドは空配列を返すPromiseを返す
      if (prop === "image" || prop === "user" || prop === "instance") {
        return new Proxy({}, {
          get(_t, method: string) {
            if (method === "findMany") {
              return async () => [];
            }
            if (method === "findUnique" || method === "findFirst") {
              return async () => null;
            }
            if (method === "count") {
              return async () => 0;
            }
            return async () => null;
          },
        });
      }
      return undefined;
    }

    const client = getPrismaClient();
    const value = client[prop as keyof AppPrismaClient];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

export default prisma;
