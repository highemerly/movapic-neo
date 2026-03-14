import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

// ビルド時かどうかを判定（ダミーURLの場合はビルド時）
function isBuildTime(): boolean {
  const url = process.env.DATABASE_URL;
  return !url || url.includes("dummy");
}

function createPrismaClient(): PrismaClient {
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
  });
}

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

// Use a Proxy to defer client creation until first access
// This allows the module to be imported during build without DATABASE_URL
export const prisma = new Proxy({} as PrismaClient, {
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
    const value = client[prop as keyof PrismaClient];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

export default prisma;
