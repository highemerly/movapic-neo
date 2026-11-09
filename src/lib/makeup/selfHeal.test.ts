/**
 * 画像削除後の失効掃除（selfHeal.ts）のテスト。
 *
 * 守るもの: 「2枚投稿 → 穴埋め指定 → 1枚削除」で、1枚しか無い日の写真が穴を埋めたまま残らないこと。
 * これが残るとポイント制では「1pt で2日ぶん得をする」抜け穴になる。
 * 一方で、代わりの写真を選んで付け替えることはしない（自動穴埋めの復活になる）。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { findMany, updateMany } = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: { image: { findMany, updateMany } },
}));

import { asPostDate } from "@/lib/dayClock";
import { healAfterImageDelete, staleDonorIdsAfterDelete } from "./selfHeal";

const row = (id: string, makeupTargetDay: number | null = null) => ({ id, makeupTargetDay });

describe("staleDonorIdsAfterDelete - 失効した割当を選ぶ", () => {
  it("削除でその日が1枚になったら、残った donor の割当は失効", () => {
    // 10日に2枚（b が3日を埋めていた）→ a を削除して b だけが残った
    expect(staleDonorIdsAfterDelete([row("b", 3)])).toEqual(["b"]);
  });

  it("その日にまだ2枚以上残っていれば何も外さない", () => {
    expect(staleDonorIdsAfterDelete([row("b", 3), row("c")])).toEqual([]);
  });

  it("残った写真が donor でなければ外すものは無い", () => {
    expect(staleDonorIdsAfterDelete([row("b")])).toEqual([]);
  });

  it("削除でその日が0枚になれば外すものは無い（donor ごと消えている）", () => {
    expect(staleDonorIdsAfterDelete([])).toEqual([]);
  });
});

describe("healAfterImageDelete - DB への反映", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMany.mockResolvedValue({ count: 1 });
  });

  it("削除した画像と同じ記録日の残りを読み、失効した割当だけを null に戻す", async () => {
    findMany.mockResolvedValue([row("b", 3)]);

    await expect(
      healAfterImageDelete({ userId: "u1", deletedPostDate: asPostDate("2026-10-10") })
    ).resolves.toBe(1);

    expect(findMany).toHaveBeenCalledWith({
      // 記録日で絞る（区切りの遅い人の 0〜2 時の投稿も、カレンダーと同じ日として数える）
      where: { userId: "u1", postDate: new Date("2026-10-10T00:00:00Z") },
      select: { id: true, makeupTargetDay: true },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["b"] } },
      // 対象月のオフセットも既定（同月）に戻す＝月またぎ donor の失効でも残骸が残らない
      data: { makeupTargetDay: null, makeupTargetMonthDelta: 0 },
    });
  });

  it("外すものが無ければ書き込まない", async () => {
    findMany.mockResolvedValue([row("b", 3), row("c")]);

    await expect(
      healAfterImageDelete({ userId: "u1", deletedPostDate: asPostDate("2026-10-10") })
    ).resolves.toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
