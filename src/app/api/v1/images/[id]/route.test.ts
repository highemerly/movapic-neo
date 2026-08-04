import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 境界（認証・DB・S3・Fediverse・穴埋め再計算・env依存のgrace）を先頭でモックする。
// perfectMonth / streak は純粋ロジックなので本物を使う（判定そのものを検証したいため）。
vi.mock("@/lib/auth/session", () => ({ getCurrentUserWithValidation: vi.fn() }));
vi.mock("@/lib/db", () => ({
  default: {
    image: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    achievement: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/storage/storage", () => ({ deleteImage: vi.fn() }));
vi.mock("@/lib/auth/tokens", () => ({ decryptToken: vi.fn((t: string) => `dec:${t}`) }));
vi.mock("@/lib/fediverse/delete", () => ({ fediverseStatusExists: vi.fn() }));
vi.mock("@/lib/achievements/makeupAssign", () => ({ recomputeMonthMakeups: vi.fn() }));
vi.mock("@/lib/achievements/grace", () => ({ perfectMonthGrace: vi.fn(() => 3) }));

import { PATCH, DELETE } from "./route";
import { getCurrentUserWithValidation } from "@/lib/auth/session";
import { deleteImage } from "@/lib/storage/storage";
import { fediverseStatusExists } from "@/lib/fediverse/delete";
import { recomputeMonthMakeups } from "@/lib/achievements/makeupAssign";
import prisma from "@/lib/db";

const mockAuth = vi.mocked(getCurrentUserWithValidation);
const mockFindUnique = vi.mocked(prisma.image.findUnique);
const mockFindMany = vi.mocked(prisma.image.findMany);
const mockUpdate = vi.mocked(prisma.image.update);
const mockDelete = vi.mocked(prisma.image.delete);
const mockAchievementFindFirst = vi.mocked(prisma.achievement.findFirst);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockDeleteImage = vi.mocked(deleteImage);
const mockStatusExists = vi.mocked(fediverseStatusExists);
const mockRecompute = vi.mocked(recomputeMonthMakeups);

type SessionUser = Awaited<ReturnType<typeof getCurrentUserWithValidation>>;
const OWNER = {
  id: "u1",
  username: "alice",
  accessToken: "enc",
  autoMakeup: false,
  instance: { domain: "handon.club", type: "mastodon" },
} as unknown as SessionUser;

/** JST でその日の正午になる Date（toJstDateString は UTC+9 で切るため）。 */
function jst(day: number, month = 3, year = 2026): Date {
  return new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
}

const params = (id = "img1") => ({ params: Promise.resolve({ id }) });

function patchReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/images/img1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(): NextRequest {
  return new NextRequest("http://localhost/api/v1/images/img1", { method: "DELETE" });
}

/** PATCH 対象の画像行（select されるフィールドのみ）。 */
function targetImage(over: Record<string, unknown> = {}) {
  return {
    id: "img1",
    userId: "u1",
    createdAt: jst(10),
    calendarPickedAt: null,
    makeupTargetDay: null,
    ...over,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(OWNER);
  mockAchievementFindFirst.mockResolvedValue(null as never);
  mockTransaction.mockImplementation(async (ops: unknown) => ops as never);
  mockUpdate.mockResolvedValue({} as never);
});

describe("DELETE /api/v1/images/[id]", () => {
  const image = (over: Record<string, unknown> = {}) =>
    ({
      id: "img1",
      userId: "u1",
      createdAt: jst(10),
      storageKey: "2026/03/10/a.jpg",
      thumbnailKey: "2026/03/10/a-thumb.webp",
      postId: null,
      postUrl: null,
      ...over,
    }) as never;

  beforeEach(() => {
    mockFindUnique.mockResolvedValue(image());
    mockDelete.mockResolvedValue({} as never);
    mockDeleteImage.mockResolvedValue(undefined as never);
  });

  it("未認証なら401を返し、削除しない", async () => {
    mockAuth.mockResolvedValue(null as unknown as SessionUser);

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(401);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("画像が無ければ404を返す", async () => {
    mockFindUnique.mockResolvedValue(null as never);

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("他人の画像は403で拒否し、S3もDBも触らない", async () => {
    mockFindUnique.mockResolvedValue(image({ userId: "other" }));

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(403);
    expect(mockDeleteImage).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("原本とサムネイルの両方をS3から削除する", async () => {
    await DELETE(deleteReq(), params());

    expect(mockDeleteImage).toHaveBeenCalledWith("2026/03/10/a.jpg");
    expect(mockDeleteImage).toHaveBeenCalledWith("2026/03/10/a-thumb.webp");
  });

  it("サムネイルが無ければ原本だけ削除する", async () => {
    mockFindUnique.mockResolvedValue(image({ thumbnailKey: null }));

    await DELETE(deleteReq(), params());

    expect(mockDeleteImage).toHaveBeenCalledTimes(1);
    expect(mockDeleteImage).toHaveBeenCalledWith("2026/03/10/a.jpg");
  });

  it("S3削除が失敗してもDB削除は続行する（プライバシー優先）", async () => {
    mockDeleteImage.mockRejectedValue(new Error("s3 down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "img1" } });
    errorSpy.mockRestore();
  });

  it("autoMakeup が有効なユーザーは、削除した月の穴埋めを再計算する", async () => {
    mockAuth.mockResolvedValue({ ...OWNER, autoMakeup: true } as SessionUser);
    mockRecompute.mockResolvedValue(undefined as never);

    await DELETE(deleteReq(), params());

    expect(mockRecompute).toHaveBeenCalledWith({
      userId: "u1",
      year: 2026,
      month: 3,
      grace: 3,
    });
  });

  it("autoMakeup が無効なユーザーの月は触らない（手動運用のため）", async () => {
    await DELETE(deleteReq(), params());

    expect(mockRecompute).not.toHaveBeenCalled();
  });

  it("穴埋め再計算が失敗しても画像削除は成功させる", async () => {
    mockAuth.mockResolvedValue({ ...OWNER, autoMakeup: true } as SessionUser);
    mockRecompute.mockRejectedValue(new Error("recompute failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(200);
    errorSpy.mockRestore();
  });

  it("連携先に投稿が残っていれば remoteStatus を返す（ここでは消さない）", async () => {
    mockFindUnique.mockResolvedValue(
      image({ postId: "s1", postUrl: "https://handon.club/@alice/s1" })
    );
    mockStatusExists.mockResolvedValue(true);

    const res = await DELETE(deleteReq(), params());

    await expect(res.json()).resolves.toEqual({
      success: true,
      remoteStatus: {
        statusId: "s1",
        statusUrl: "https://handon.club/@alice/s1",
        platform: "mastodon",
      },
    });
    expect(mockStatusExists).toHaveBeenCalledWith("mastodon", "handon.club", "dec:enc", "s1");
  });

  it("連携先に投稿が残っていなければ remoteStatus は null", async () => {
    mockFindUnique.mockResolvedValue(image({ postId: "s1" }));
    mockStatusExists.mockResolvedValue(false);

    const res = await DELETE(deleteReq(), params());

    await expect(res.json()).resolves.toEqual({ success: true, remoteStatus: null });
  });

  it("postId が無ければ連携先へ問い合わせない", async () => {
    await DELETE(deleteReq(), params());

    expect(mockStatusExists).not.toHaveBeenCalled();
  });

  it("連携先の確認が失敗しても、削除は成功として返す", async () => {
    mockFindUnique.mockResolvedValue(image({ postId: "s1" }));
    mockStatusExists.mockRejectedValue(new Error("instance down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, remoteStatus: null });
    errorSpy.mockRestore();
  });

  it("DB削除が失敗したら500を返す", async () => {
    mockDelete.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(500);
    errorSpy.mockRestore();
  });
});

describe("PATCH /api/v1/images/[id]", () => {
  /** 月内の全画像。dayCounts と各種バリデーションの母集合になる。 */
  function monthImages(entries: Array<{ id: string; day: number; makeupTargetDay?: number | null }>) {
    return entries.map((e) => ({
      id: e.id,
      createdAt: jst(e.day),
      makeupTargetDay: e.makeupTargetDay ?? null,
    })) as never;
  }

  beforeEach(() => {
    mockFindUnique.mockResolvedValue(targetImage());
    // 既定: 10日にダブル投稿、1日に1枚。10日の写真で 5日の穴を埋められる状態。
    mockFindMany.mockResolvedValue(
      monthImages([
        { id: "img1", day: 10 },
        { id: "img2", day: 10 },
        { id: "img3", day: 1 },
      ])
    );
  });

  it("未認証なら401を返す", async () => {
    mockAuth.mockResolvedValue(null as unknown as SessionUser);

    const res = await PATCH(patchReq({ calendarPicked: true }), params());

    expect(res.status).toBe(401);
  });

  it("画像が無ければ404を返す", async () => {
    mockFindUnique.mockResolvedValue(null as never);

    const res = await PATCH(patchReq({ calendarPicked: true }), params());

    expect(res.status).toBe(404);
  });

  it("他人の画像は403で拒否する", async () => {
    mockFindUnique.mockResolvedValue(targetImage({ userId: "other" }));

    const res = await PATCH(patchReq({ calendarPicked: true }), params());

    expect(res.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("更新フィールドが無ければ400を返す", async () => {
    const res = await PATCH(patchReq({}), params());

    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  describe("代表（サムネイル）の指定", () => {
    it("代表にすると、同じ日の他の画像の代表指定を外す", async () => {
      const res = await PATCH(patchReq({ calendarPicked: true }), params());

      expect(res.status).toBe(200);
      // 自分は日時が入り、同日の img2 は null に落ちる。別日の img3 は触らない。
      const calls = mockUpdate.mock.calls.map((c) => c[0]);
      expect(calls).toHaveLength(2);
      expect(calls[0].where).toEqual({ id: "img1" });
      expect(calls[0].data.calendarPickedAt).toBeInstanceOf(Date);
      expect(calls[1]).toEqual({ where: { id: "img2" }, data: { calendarPickedAt: null } });
    });

    it("代表を解除すると自分だけを null にする", async () => {
      const res = await PATCH(patchReq({ calendarPicked: false }), params());

      expect(res.status).toBe(200);
      expect(mockUpdate.mock.calls.map((c) => c[0])).toEqual([
        { where: { id: "img1" }, data: { calendarPickedAt: null } },
      ]);
    });

    it("穴埋めに使っている写真は代表にできない", async () => {
      mockFindUnique.mockResolvedValue(targetImage({ makeupTargetDay: 5 }));

      const res = await PATCH(patchReq({ calendarPicked: true }), params());

      expect(res.status).toBe(409);
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });

  describe("穴埋め割当", () => {
    it("条件を満たせば割り当てる", async () => {
      const res = await PATCH(patchReq({ makeupTargetDay: 5 }), params());

      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "img1" },
        data: { makeupTargetDay: 5 },
      });
    });

    it("割当を解除できる", async () => {
      mockFindUnique.mockResolvedValue(targetImage({ makeupTargetDay: 5 }));

      const res = await PATCH(patchReq({ makeupTargetDay: null }), params());

      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "img1" },
        data: { makeupTargetDay: null },
      });
    });

    it.each([
      ["月の日数を超える", 32],
      ["0以下", 0],
      ["整数でない", 1.5],
      ["数値でない", "5"],
    ])("穴埋め先が不正なら400を返す（%s）", async (_label, target) => {
      const res = await PATCH(patchReq({ makeupTargetDay: target }), params());

      expect(res.status).toBe(400);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("自分より前の日しか埋められない（同日・未来は409）", async () => {
      const res = await PATCH(patchReq({ makeupTargetDay: 10 }), params());

      expect(res.status).toBe(409);
    });

    it("投稿がある日は埋められない", async () => {
      const res = await PATCH(patchReq({ makeupTargetDay: 1 }), params());

      expect(res.status).toBe(409);
    });

    it("ダブル投稿の日の写真でなければ穴埋めに使えない", async () => {
      mockFindUnique.mockResolvedValue(targetImage({ createdAt: jst(20) }));
      mockFindMany.mockResolvedValue(
        monthImages([
          { id: "img1", day: 20 },
          { id: "img3", day: 1 },
        ])
      );

      const res = await PATCH(patchReq({ makeupTargetDay: 5 }), params());

      expect(res.status).toBe(409);
    });

    it("代表にしている写真は穴埋めに使えない", async () => {
      mockFindUnique.mockResolvedValue(targetImage({ calendarPickedAt: new Date() }));

      const res = await PATCH(patchReq({ makeupTargetDay: 5 }), params());

      expect(res.status).toBe(409);
    });

    it("同じ穴を埋めていた別の写真は外す（1穴1donor＝付け替え）", async () => {
      mockFindMany.mockResolvedValue(
        monthImages([
          { id: "img1", day: 10 },
          { id: "img2", day: 10 },
          { id: "img4", day: 20, makeupTargetDay: 5 },
        ])
      );

      const res = await PATCH(patchReq({ makeupTargetDay: 5 }), params());

      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "img4" },
        data: { makeupTargetDay: null },
      });
    });

    it("同じ日の他のdonorは外す（1日1donor）", async () => {
      mockFindMany.mockResolvedValue(
        monthImages([
          { id: "img1", day: 10 },
          { id: "img2", day: 10, makeupTargetDay: 7 },
          { id: "img3", day: 1 },
        ])
      );

      const res = await PATCH(patchReq({ makeupTargetDay: 5 }), params());

      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "img2" },
        data: { makeupTargetDay: null },
      });
    });

    it("grace（既定3日）を超える新規割当は409で拒否する", async () => {
      // 既に3つの穴（2,3,4日）を埋めている状態で、4つ目（5日）を足そうとする。
      mockFindMany.mockResolvedValue(
        monthImages([
          { id: "img1", day: 10 },
          { id: "img2", day: 10 },
          { id: "d1", day: 20, makeupTargetDay: 2 },
          { id: "d2", day: 21, makeupTargetDay: 3 },
          { id: "d3", day: 22, makeupTargetDay: 4 },
        ])
      );

      const res = await PATCH(patchReq({ makeupTargetDay: 5 }), params());

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({ error: "穴埋めは1か月に3日までです" });
    });

    it("皆勤賞を達成済みの月では、非達成に落ちる解除を拒否する", async () => {
      mockFindUnique.mockResolvedValue(targetImage({ makeupTargetDay: 5 }));
      mockAchievementFindFirst.mockResolvedValue({ id: "a1" } as never);

      const res = await PATCH(patchReq({ makeupTargetDay: null }), params());

      expect(res.status).toBe(409);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("皆勤賞の判定は投稿月のキーで引く（当月ではなく）", async () => {
      mockFindUnique.mockResolvedValue(targetImage({ makeupTargetDay: 5 }));

      await PATCH(patchReq({ makeupTargetDay: null }), params());

      expect(mockAchievementFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: "u1", key: expect.stringContaining("2026-03") }),
        })
      );
    });
  });

  it("DBが落ちたら500を返す", async () => {
    mockFindUnique.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await PATCH(patchReq({ calendarPicked: true }), params());

    expect(res.status).toBe(500);
    errorSpy.mockRestore();
  });
});
