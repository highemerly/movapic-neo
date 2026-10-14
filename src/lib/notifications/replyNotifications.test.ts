/**
 * リプライ通知の作成（createReplyNotification）。
 * 自分宛は作らない・決定的 id で冪等・ミュートは書き込み時に見ないことを固定する。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { findUnique, upsert } = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));

vi.mock("@/lib/db", () => ({
  default: { image: { findUnique }, notification: { upsert } },
}));

import { createReplyNotification } from "./replyNotifications";

const PARAMS = { replyImageId: "reply-img", replierUserId: "bob", parentImageId: "parent-img" };

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({});
});

describe("createReplyNotification", () => {
  it("親の投稿者へ type=reply・imageId=リプライ画像で作る（id は決定的＝再試行で重複しない）", async () => {
    findUnique.mockResolvedValue({ userId: "alice" });

    await createReplyNotification(PARAMS);

    expect(upsert).toHaveBeenCalledWith({
      where: { id: "reply-reply-img" },
      create: { id: "reply-reply-img", userId: "alice", type: "reply", imageId: "reply-img" },
      update: {},
    });
  });

  it("自分の投稿へのリプライ（セルフスレッド・連）は通知しない", async () => {
    findUnique.mockResolvedValue({ userId: "bob" });
    await createReplyNotification(PARAMS);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("親が既に無ければ通知しない", async () => {
    findUnique.mockResolvedValue(null);
    await createReplyNotification(PARAMS);
    expect(upsert).not.toHaveBeenCalled();
  });
});
