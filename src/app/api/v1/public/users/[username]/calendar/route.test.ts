/**
 * GET /api/v1/public/users/[username]/calendar のテスト（穴埋め枠まわり）。
 *
 * 守るもの:
 * - 穴埋めの上限は「カレンダーの持ち主」について ledger で解決し、表示の解決（resolveCalendarMonth）へ渡す
 *   （閲覧者に依存しない＝非ownerの公開キャッシュが安全）
 * - 残りポイント・締切・付与履歴（perfectMonth.makeup）は本人にだけ返し、キャッシュも private にする
 *
 * DB・認証・台帳はモックし、表示の解決（resolveCalendarMonth）は本物を使う。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  default: {
    user: { findFirst: vi.fn() },
    image: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/makeup/ledger", () => ({ resolveMakeupLimits: vi.fn() }));
vi.mock("@/lib/calendar/resolveMonth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/calendar/resolveMonth")>()),
  fetchCalendarImages: vi.fn(),
}));

import { GET } from "./route";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveMakeupLimits } from "@/lib/makeup/ledger";
import { fetchCalendarImages } from "@/lib/calendar/resolveMonth";

const mockUserFindFirst = vi.mocked(prisma.user.findFirst);
const mockImageFindFirst = vi.mocked(prisma.image.findFirst);
const mockViewer = vi.mocked(getCurrentUser);
const mockLimits = vi.mocked(resolveMakeupLimits);
const mockImages = vi.mocked(fetchCalendarImages);

/** JST で 2026-10-DD の正午。 */
const jst = (day: number) => new Date(Date.UTC(2026, 9, day, 3, 0, 0));
const image = (id: string, day: number, makeupTargetDay: number | null = null) => ({
  id,
  thumbnailKey: null,
  storageKey: `k/${id}`,
  position: "bottom",
  createdAt: jst(day),
  calendarPickedAt: null,
  makeupTargetDay,
});

function req(): NextRequest {
  return new NextRequest("http://localhost/api/v1/public/users/alice@handon.club/calendar?year=2026&month=10");
}
const params = { params: Promise.resolve({ username: "alice@handon.club" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(jst(20));
  mockUserFindFirst.mockResolvedValue({ id: "owner" } as never);
  mockImageFindFirst.mockResolvedValue(null as never);
  // 1日・3日・3日（3日の2枚目で2日を埋めた）
  mockImages.mockResolvedValue([image("a", 1), image("b", 3), image("c", 3, 2)] as never);
  mockLimits.mockResolvedValue({
    pointEra: true,
    cap: 2,
    potentialCap: 3,
    grants: [
      { reason: "favor-monthly", amount: 1, grantedAt: new Date("2026-10-01T00:10:00Z") },
      { reason: "monthly-catchup", amount: 1, grantedAt: new Date("2026-10-11T00:10:00Z") },
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET calendar - 穴埋め枠", () => {
  it("上限はカレンダーの持ち主について、対象月で解決する（閲覧者ではない）", async () => {
    mockViewer.mockResolvedValue({ id: "someone-else" } as never);

    await GET(req(), params);

    expect(mockLimits).toHaveBeenCalledWith({
      userId: "owner",
      instanceDomain: "handon.club",
      ym: "2026-10",
      now: jst(20),
    });
  });

  it("本人には残り・締切・付与履歴を返し、キャッシュは private にする", async () => {
    mockViewer.mockResolvedValue({ id: "owner" } as never);

    const res = await GET(req(), params);
    const body = await res.json();

    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.perfectMonth.makeup).toEqual({
      pointEra: true,
      limit: 2,
      used: 1,
      usedDays: [2],
      remaining: 1,
      // 20日時点の今月: 1日・3日のほかは投稿なし。2日は穴埋め済みなので、4〜19日の16日
      unfilled: 16,
      deadline: "2026-11-10T15:00:00.000Z",
      editable: true,
      grants: [
        { reason: "favor-monthly", amount: 1, grantedAt: "2026-10-01T00:10:00.000Z" },
        { reason: "monthly-catchup", amount: 1, grantedAt: "2026-10-11T00:10:00.000Z" },
      ],
    });
  });

  it("本人以外には穴埋め枠を返さない（ポイントや付与履歴は本人だけの情報）", async () => {
    mockViewer.mockResolvedValue(null as never);

    const res = await GET(req(), params);
    const body = await res.json();

    expect(body.perfectMonth.makeup).toBeUndefined();
    // 穴埋め表示（どの日が埋まっているか）は公開のまま
    expect(body.perfectMonth.filledDays).toHaveLength(1);
    expect(res.headers.get("Cache-Control")).not.toBe("private, no-store");
  });

  it("締切後の月は editable=false", async () => {
    vi.setSystemTime(new Date("2026-11-10T15:00:00Z")); // 11/11 00:00 JST
    mockViewer.mockResolvedValue({ id: "owner" } as never);

    const res = await GET(req(), params);
    const body = await res.json();

    expect(body.perfectMonth.makeup.editable).toBe(false);
  });
});
