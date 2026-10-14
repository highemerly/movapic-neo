import { describe, it, expect } from "vitest";
import { filterFavoriteFeedByMuted, isReplyNotificationVisible } from "./muteFilter";

function fav(accts: string[], count = accts.length) {
  return { count, favoriters: accts.map((acct) => ({ acct })) };
}

describe("filterFavoriteFeedByMuted", () => {
  it("ミュートが空なら同じ参照をそのまま返す", () => {
    const f = fav(["a@ex.com", "b@ex.com"]);
    expect(filterFavoriteFeedByMuted(f, new Set())).toBe(f);
  });

  it("ミュート相手が居なければ同じ参照を返す", () => {
    const f = fav(["a@ex.com"]);
    expect(filterFavoriteFeedByMuted(f, new Set(["x@ex.com"]))).toBe(f);
  });

  it("ミュート相手を除き、総数もその分減らす", () => {
    const f = fav(["a@ex.com", "b@ex.com", "c@ex.com"]);
    const r = filterFavoriteFeedByMuted(f, new Set(["b@ex.com"]));
    expect(r).toEqual({ count: 2, favoriters: [{ acct: "a@ex.com" }, { acct: "c@ex.com" }] });
  });

  it("表示相手も総数も尽きたら null（通知ごと隠す）", () => {
    const f = fav(["a@ex.com", "b@ex.com"]); // count=2
    expect(filterFavoriteFeedByMuted(f, new Set(["a@ex.com", "b@ex.com"]))).toBeNull();
  });

  it("総数が表示相手より多い（上位N件外に他者が居る）ときは残す", () => {
    const f = fav(["a@ex.com"], 3); // 表示は1人だが総数3
    const r = filterFavoriteFeedByMuted(f, new Set(["a@ex.com"]));
    expect(r).toEqual({ count: 2, favoriters: [] });
  });
});

describe("isReplyNotificationVisible", () => {
  const visible = (
    replyImage: { isDisabled: boolean; parentUserId: string | null; authorAcct: string } | null,
    muted: string[] = []
  ) => isReplyNotificationVisible({ recipientUserId: "me", replyImage }, new Set(muted));
  const ok = { isDisabled: false, parentUserId: "me", authorAcct: "bob@ex.com" };

  it("見えるリプライなら出す", () => {
    expect(visible(ok)).toBe(true);
  });

  it("リプライ画像が削除された（imageId が SET NULL）なら隠す", () => {
    expect(visible(null)).toBe(false);
  });

  it("リプライ画像が取り下げられたら隠す", () => {
    expect(visible({ ...ok, isDisabled: true })).toBe(false);
  });

  it("親が削除された（replyTo が SET NULL）なら隠す", () => {
    expect(visible({ ...ok, parentUserId: null })).toBe(false);
  });

  it("親が受信者の投稿でなければ隠す", () => {
    expect(visible({ ...ok, parentUserId: "someone" })).toBe(false);
  });

  it("送信者をミュートしていたら隠す（読み取り時に muter の視界から落とす）", () => {
    expect(visible(ok, ["bob@ex.com"])).toBe(false);
    expect(visible(ok, ["carol@ex.com"])).toBe(true);
  });
});
