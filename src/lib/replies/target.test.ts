/**
 * リプライ先の取得（findReplyableImage / findLatestOwnImageId）のクエリ条件を固定する。
 * 特に「連」が投稿者本人の投稿にしか繋がらないこと（userId で絞る）を保証する。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/lib/db", () => ({ default: { image: { findFirst } } }));

import { findLatestOwnImageId, findReplyableImage } from "./target";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findLatestOwnImageId", () => {
  it("投稿者本人の、見えている最新の投稿を createdAt→id の降順で引く", async () => {
    findFirst.mockResolvedValue({ id: "img-3" });

    await expect(findLatestOwnImageId("user-1")).resolves.toBe("img-3");

    const args = findFirst.mock.calls[0][0];
    // 他人の投稿を拾わない（userId で絞る）・取り下げ済みは本人にも見えないので飛ばす
    expect(args.where).toEqual({ userId: "user-1", isPublic: true, isDisabled: false });
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });

  it("投稿が無ければ null", async () => {
    findFirst.mockResolvedValue(null);
    await expect(findLatestOwnImageId("user-1")).resolves.toBeNull();
  });
});

describe("findReplyableImage", () => {
  it("見えている画像だけを返す（ミュートは見ない＝書き込みでは拒否しない）", async () => {
    findFirst.mockResolvedValue({ id: "img-1" });

    await findReplyableImage("img-1");

    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: "img-1",
      isPublic: true,
      isDisabled: false,
    });
  });

  it("見えなければ null", async () => {
    findFirst.mockResolvedValue(null);
    await expect(findReplyableImage("gone")).resolves.toBeNull();
  });
});
