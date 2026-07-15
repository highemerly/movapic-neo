import { describe, it, expect, vi, beforeEach } from "vitest";

// DB 境界をモックして純粋な「クエリ組み立て・結果マッピング」だけを検証する。
vi.mock("@/lib/db", () => ({
  default: {
    mute: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import {
  getActiveMutedUserIds,
  getMutedAuthorKeys,
  isMutedByViewer,
} from "./mutes";
import prisma from "@/lib/db";

const mockFindMany = vi.mocked(prisma.mute.findMany);
const mockFindFirst = vi.mocked(prisma.mute.findFirst);

const NOW = new Date("2026-07-15T00:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("activeExpiryWhere（有効期限セマンティクス）", () => {
  it("期限切れを除外する OR 条件（null または未来）を where に含める", async () => {
    mockFindMany.mockResolvedValue([] as never);
    await getActiveMutedUserIds("me", NOW);
    const where = mockFindMany.mock.calls[0][0]!.where as {
      muterId: string;
      OR: Array<{ expiresAt: null | { gt: Date } }>;
    };
    expect(where.muterId).toBe("me");
    expect(where.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: NOW } }]);
  });
});

describe("getActiveMutedUserIds", () => {
  it("mutedUserId の配列に射影する", async () => {
    mockFindMany.mockResolvedValue([
      { mutedUserId: "a" },
      { mutedUserId: "b" },
    ] as never);
    expect(await getActiveMutedUserIds("me", NOW)).toEqual(["a", "b"]);
  });
});

describe("getMutedAuthorKeys（クライアント除外の照合キー契約）", () => {
  it("`username@domain` 形式を組み立てる（タイムラインカードのキーと一致させる）", async () => {
    mockFindMany.mockResolvedValue([
      { mutedUser: { username: "alice", instance: { domain: "handon.club" } } },
      { mutedUser: { username: "bob", instance: { domain: "example.com" } } },
    ] as never);
    expect(await getMutedAuthorKeys("me", NOW)).toEqual([
      "alice@handon.club",
      "bob@example.com",
    ]);
  });
});

describe("isMutedByViewer", () => {
  it("未ログイン（viewer なし）は false・DBを引かない", async () => {
    expect(await isMutedByViewer(null, "bob", NOW)).toBe(false);
    expect(await isMutedByViewer(undefined, "bob", NOW)).toBe(false);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("自分自身は false・DBを引かない", async () => {
    expect(await isMutedByViewer("me", "me", NOW)).toBe(false);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("有効なミュートがあれば true", async () => {
    mockFindFirst.mockResolvedValue({ expiresAt: null } as never);
    expect(await isMutedByViewer("me", "bob", NOW)).toBe(true);
  });

  it("該当ミュートが無ければ false", async () => {
    mockFindFirst.mockResolvedValue(null as never);
    expect(await isMutedByViewer("me", "bob", NOW)).toBe(false);
  });
});
