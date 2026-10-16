import { describe, it, expect, vi, beforeEach } from "vitest";

const { reactionUpsert, reactionFindMany } = vi.hoisted(() => ({
  reactionUpsert: vi.fn(),
  reactionFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: { reaction: { upsert: reactionUpsert, findMany: reactionFindMany } },
}));

import { setReaction, loadReactionsForReconcile } from "./store";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setReaction", () => {
  const base = { imageId: "img1", userId: "u1", emoji: "👍", emojiImageUrl: null };

  it("Fediverse へ送ったら送信時刻を残す（付け替えでも更新＝取り消し検知の猶予の起点）", async () => {
    await setReaction({ ...base, federated: true });
    const arg = reactionUpsert.mock.calls[0][0];
    expect(arg.create.federatedAt).toBeInstanceOf(Date);
    expect(arg.update.federatedAt).toBeInstanceOf(Date);
  });

  it("送っていない（local 投稿）なら null にする", async () => {
    await setReaction({ ...base, federated: false });
    const arg = reactionUpsert.mock.calls[0][0];
    expect(arg.create.federatedAt).toBeNull();
    expect(arg.update.federatedAt).toBeNull();
  });
});

describe("loadReactionsForReconcile", () => {
  it("送った行だけを読み、送信時刻を猶予の起点として返す（local 時代の行を取り消しと誤検知しない）", async () => {
    const federatedAt = new Date("2026-10-16T00:00:00Z");
    reactionFindMany.mockResolvedValue([
      {
        userId: "u1",
        federatedAt,
        user: { username: "alice", instance: { domain: "handon.club" } },
      },
    ]);

    const rows = await loadReactionsForReconcile("img1");

    expect(reactionFindMany.mock.calls[0][0].where).toEqual({
      imageId: "img1",
      federatedAt: { not: null },
    });
    expect(rows).toEqual([{ userId: "u1", acct: "alice@handon.club", federatedAt }]);
  });
});
