/**
 * 穴埋め割当の永続化（makeupAssign.ts）のユニットテスト。
 *
 * ここは「純粋な割当規則（perfectMonth.ts）を DB に橋渡しする」side。prisma をモックし、
 * 「現在の投稿集合 → どの行を makeupTargetDay に書く/戻すか」の対応を検証する。
 *
 * とくに削除まわり: 画像削除エンドポイントは autoMakeup ユーザーに対して recomputeMonthMakeups を
 * 呼び「残った投稿だけで割当を組み直す」。その差分更新（変わった行だけ update・変化ゼロなら
 * トランザクションを張らない・orphan donor を null に戻す）をここで担保する。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.mock は巻き上げられるため、参照する mock 関数は vi.hoisted で先に生成する。
const { findMany, update, transaction } = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn((arg) => ({ __update: arg })), // update の引数を透過的に包んで $transaction 側で観測可能に
  transaction: vi.fn(async (ops) => ops),
}));

vi.mock("@/lib/db", () => ({
  default: {
    image: { findMany, update },
    $transaction: transaction,
  },
}));

import { recomputeMonthMakeups, assignMakeupForNewPost } from "./makeupAssign";

/**
 * JST で 2026-06-DD の正午になる Date を作る（day は月内の日）。
 * toJstDateString は +9h して ISO 日付を取るので、UTC 03:00 = JST 12:00。
 */
function jstDate(day: number, month = 6, year = 2026): Date {
  return new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
}

/** findMany が返す1行分。 */
function row(id: string, day: number, makeupTargetDay: number | null = null) {
  return { id, createdAt: jstDate(day), makeupTargetDay };
}

/** transaction に渡された update の data.makeupTargetDay を {id: value} で取り出す。 */
function appliedUpdates(): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const call of transaction.mock.calls) {
    const ops = call[0] as Array<{ __update: { where: { id: string }; data: { makeupTargetDay: number | null } } }>;
    for (const op of ops) out[op.__update.where.id] = op.__update.data.makeupTargetDay;
  }
  return out;
}

beforeEach(() => {
  findMany.mockReset();
  update.mockClear();
  transaction.mockClear();
});

describe("recomputeMonthMakeups - 削除後の自己修復（差分だけ貼り直す）", () => {
  it("donor を削除した後、残ったダブル投稿へ割当を付け替える", () => {
    // 削除後の残り: day2 に a,c（元の donor b は既に消えている想定）。
    // どちらも makeupTargetDay=null で残っているので、2枚目 c に day1 を割り当て直す。
    findMany.mockResolvedValue([row("a", 2, null), row("c", 2, null)]);

    return recomputeMonthMakeups({ userId: "u1", year: 2026, month: 6, grace: 3 }).then(() => {
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(appliedUpdates()).toEqual({ c: 1 });
    });
  });

  it("ダブルが解消された orphan donor は null に戻す", () => {
    // day2 が1枚に減ったのに makeupTargetDay=1 が残っている → 割当対象外なので null へ。
    findMany.mockResolvedValue([row("b", 2, 1)]);

    return recomputeMonthMakeups({ userId: "u1", year: 2026, month: 6, grace: 3 }).then(() => {
      expect(appliedUpdates()).toEqual({ b: null });
    });
  });

  it("既に整合していれば1件も update せずトランザクションも張らない", () => {
    // a=null, b=1 は assignMonthMakeups の結果と一致（b が day1 の donor）。
    findMany.mockResolvedValue([row("a", 2, null), row("b", 2, 1)]);

    return recomputeMonthMakeups({ userId: "u1", year: 2026, month: 6, grace: 3 }).then(() => {
      expect(update).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    });
  });

  it("穴の当日投稿を削除して穴が生まれた場合、後日のダブルで埋め直す", () => {
    // 削除後の残り: day2 ダブル(a,b) のみ（day1 の投稿が消えて空きになった）。
    // b が day1 を埋めるよう新たに割り当てる。
    findMany.mockResolvedValue([row("a", 2, null), row("b", 2, null)]);

    return recomputeMonthMakeups({ userId: "u1", year: 2026, month: 6, grace: 3 }).then(() => {
      expect(appliedUpdates()).toEqual({ b: 1 });
    });
  });

  it("JST月境界で findMany を問い合わせる（UTC -9h のレンジ）", () => {
    findMany.mockResolvedValue([]);
    return recomputeMonthMakeups({ userId: "u1", year: 2026, month: 6, grace: 3 }).then(() => {
      const arg = findMany.mock.calls[0][0];
      expect(arg.where.userId).toBe("u1");
      // JST 2026-06-01 00:00 = UTC 2026-05-31 15:00
      expect(arg.where.createdAt.gte).toEqual(new Date(Date.UTC(2026, 4, 31, 15, 0, 0)));
      expect(arg.where.createdAt.lt).toEqual(new Date(Date.UTC(2026, 5, 30, 15, 0, 0)));
      expect(arg.orderBy).toEqual({ createdAt: "asc" });
    });
  });
});

describe("assignMakeupForNewPost - 投稿の瞬間に最大1件だけ割り当てる（live）", () => {
  it("新規投稿でダブルになり過去に空きがあれば最古の穴を書く", () => {
    // 既存: day1 空, day3 に a。新規 b が day3 の2枚目 → day1 を埋める。
    findMany.mockResolvedValue([row("a", 3, null), row("b", 3, null)]);

    return assignMakeupForNewPost({ userId: "u1", imageId: "b", createdAt: jstDate(3), grace: 3 }).then(() => {
      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith({ where: { id: "b" }, data: { makeupTargetDay: 1 } });
    });
  });

  it("ダブルでなければ何も書かない", () => {
    // day3 に b 1枚だけ
    findMany.mockResolvedValue([row("b", 3, null)]);

    return assignMakeupForNewPost({ userId: "u1", imageId: "b", createdAt: jstDate(3), grace: 3 }).then(() => {
      expect(update).not.toHaveBeenCalled();
    });
  });

  it("その日に既に donor がいれば書かない（1日1donor）", () => {
    // day3 に a(既に day1 の donor), b(新規)。b は書かない。
    findMany.mockResolvedValue([row("a", 3, 1), row("b", 3, null)]);

    return assignMakeupForNewPost({ userId: "u1", imageId: "b", createdAt: jstDate(3), grace: 3 }).then(() => {
      expect(update).not.toHaveBeenCalled();
    });
  });

  it("過去に空き日が無ければ書かない（将来日は埋められない）", () => {
    // day1,day2 は投稿済み、day3 が新規でダブルだが埋める穴が無い。
    findMany.mockResolvedValue([row("x", 1), row("y", 2), row("a", 3, null), row("b", 3, null)]);

    return assignMakeupForNewPost({ userId: "u1", imageId: "b", createdAt: jstDate(3), grace: 3 }).then(() => {
      expect(update).not.toHaveBeenCalled();
    });
  });
});
