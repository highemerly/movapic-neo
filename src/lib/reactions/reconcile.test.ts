import { describe, it, expect } from "vitest";
import {
  reactionsUnfavoritedOnOwner,
  type ReactionForReconcile,
} from "./reconcile";

const NOW = new Date("2026-07-25T12:00:00Z");
const GRACE = 10 * 60 * 1000; // 10分

function reaction(
  userId: string,
  acct: string,
  ageMs: number
): ReactionForReconcile {
  return { userId, acct, createdAt: new Date(NOW.getTime() - ageMs) };
}

describe("reactionsUnfavoritedOnOwner", () => {
  it("一覧に居ないリアクションを取り消しとして返す", () => {
    const removed = reactionsUnfavoritedOnOwner({
      reactions: [
        reaction("u1", "alice@handon.club", 60 * 60 * 1000),
        reaction("u2", "bob@mi.hiyoko.club", 60 * 60 * 1000),
      ],
      ownerAccts: new Set(["alice@handon.club"]), // bob は一覧から消えた
      now: NOW,
      graceMs: GRACE,
    });
    expect(removed).toEqual(["u2"]);
  });

  it("一覧に残っているリアクションは対象にしない", () => {
    const removed = reactionsUnfavoritedOnOwner({
      reactions: [reaction("u1", "alice@handon.club", 60 * 60 * 1000)],
      ownerAccts: new Set(["alice@handon.club"]),
      now: NOW,
      graceMs: GRACE,
    });
    expect(removed).toEqual([]);
  });

  it("猶予内（付けた直後）のリアクションは一覧に無くても消さない", () => {
    // 連合がまだ伝播しておらず一覧に出ていないだけかもしれないため
    const removed = reactionsUnfavoritedOnOwner({
      reactions: [reaction("u1", "alice@handon.club", 60 * 1000)], // 1分前
      ownerAccts: new Set(), // 一覧には未反映
      now: NOW,
      graceMs: GRACE,
    });
    expect(removed).toEqual([]);
  });

  it("猶予境界（ちょうど graceMs 経過）は対象になる", () => {
    const removed = reactionsUnfavoritedOnOwner({
      reactions: [reaction("u1", "alice@handon.club", GRACE)],
      ownerAccts: new Set(),
      now: NOW,
      graceMs: GRACE,
    });
    expect(removed).toEqual(["u1"]);
  });

  it("空入力では空を返す", () => {
    expect(
      reactionsUnfavoritedOnOwner({
        reactions: [],
        ownerAccts: new Set(["alice@handon.club"]),
        now: NOW,
        graceMs: GRACE,
      })
    ).toEqual([]);
  });
});
