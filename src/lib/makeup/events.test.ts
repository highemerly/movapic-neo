/**
 * 穴埋めポイントのイベント一覧（events.ts）のテスト。
 *
 * 守るもの:
 * - イベントは「開始日時以降・付与先の月の間」だけ配る（翌月にずれ込んで翌月分にしない）
 * - 対象者の条件（開始時点で登録済み）
 * - 表示名は reason からイベント一覧を引く
 * - 一覧のキーは一意（台帳の一意制約が同じ reason を1人1回に絞るので、重複すると2つ目が配られない）
 */

import { describe, it, expect } from "vitest";
import {
  MAKEUP_POINT_EVENTS,
  activeMakeupEvents,
  findMakeupEventByReason,
  makeupEventCreatedAtFilter,
  makeupEventReason,
  type MakeupPointEventDef,
} from "./events";

const LAUNCH: MakeupPointEventDef = {
  key: "launch-2026-10",
  name: "穴埋めポイント開始記念",
  month: "2026-10",
  amount: 1,
  start: "2026-10-01T00:00:00+09:00",
  target: "registered-before-start",
};

describe("MAKEUP_POINT_EVENTS - 一覧そのもの", () => {
  it("キーが一意", () => {
    const keys = MAKEUP_POINT_EVENTS.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("台帳の reason（VarChar 64）に収まり、開始日時が付与先の月の中にある", () => {
    for (const e of MAKEUP_POINT_EVENTS) {
      expect(makeupEventReason(e.key).length).toBeLessThanOrEqual(64);
      expect(Number.isNaN(new Date(e.start).getTime())).toBe(false);
      // 開始が別の月だと一度も配られない
      expect(activeMakeupEvents(new Date(e.start), [e])).toEqual([e]);
    }
  });

  it("2026-10 の開始記念が 1pt・開始時点の登録者向けで入っている", () => {
    expect(MAKEUP_POINT_EVENTS).toContainEqual(LAUNCH);
  });
});

describe("activeMakeupEvents - 配る期間", () => {
  it("開始の直前は配らない（9/30 23:59:59 JST）", () => {
    expect(activeMakeupEvents(new Date("2026-09-30T14:59:59Z"), [LAUNCH])).toEqual([]);
  });

  it("開始の瞬間から配る（10/1 00:00 JST）", () => {
    expect(activeMakeupEvents(new Date("2026-09-30T15:00:00Z"), [LAUNCH])).toEqual([LAUNCH]);
  });

  it("月の途中でも配る（ジョブが止まっていても追いつく）", () => {
    expect(activeMakeupEvents(new Date("2026-10-20T03:00:00Z"), [LAUNCH])).toEqual([LAUNCH]);
  });

  it("翌月になったら配らない（翌月分のポイントにしない・持ち越せないので意味が無い）", () => {
    expect(activeMakeupEvents(new Date("2026-10-31T15:00:00Z"), [LAUNCH])).toEqual([]);
  });
});

describe("makeupEventCreatedAtFilter - 対象者", () => {
  it("開始時点で登録済みの人だけ（開始時刻より前に作成）", () => {
    expect(makeupEventCreatedAtFilter(LAUNCH)).toEqual({ lt: new Date("2026-09-30T15:00:00Z") });
  });
});

describe("findMakeupEventByReason - 表示名の解決", () => {
  it("event:<key> から一覧のイベントを引く", () => {
    expect(findMakeupEventByReason("event:launch-2026-10", [LAUNCH])).toEqual(LAUNCH);
  });

  it("一覧に無いイベント・イベントでない理由は null", () => {
    expect(findMakeupEventByReason("event:dev-seed", [LAUNCH])).toBeNull();
    expect(findMakeupEventByReason("signup", [LAUNCH])).toBeNull();
  });
});
