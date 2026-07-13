import { describe, it, expect } from "vitest";
import {
  isPublished,
  isBannerEligible,
  isPinnedNow,
  bannerEndsAt,
  listForAnnouncementsPage,
  bannerAnnouncements,
  normalizeAnnouncementType,
  formatAnnouncementDate,
  toAnnouncementRecord,
  parseAnnouncementReadState,
  isAnnouncementRead,
  serializeAnnouncementReadIds,
  unreadBannerAnnouncements,
  type AnnouncementRecord,
} from "./announcements";

const NOW = Date.parse("2026-07-13T00:00:00Z");

function rec(over: Partial<AnnouncementRecord>): AnnouncementRecord {
  return {
    id: 1,
    type: "info",
    message: "msg",
    detail: null,
    publishAt: "2026-07-01T00:00:00.000Z",
    pinnedUntil: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

describe("normalizeAnnouncementType", () => {
  it("既知の値はそのまま返す", () => {
    expect(normalizeAnnouncementType("warning")).toBe("warning");
    expect(normalizeAnnouncementType("info")).toBe("info");
    expect(normalizeAnnouncementType("low")).toBe("low");
  });
  it("未知の値は info に丸める", () => {
    expect(normalizeAnnouncementType("bogus")).toBe("info");
    expect(normalizeAnnouncementType("")).toBe("info");
  });
});

describe("isPublished", () => {
  it("publishAt が now 以前なら公開済み", () => {
    expect(isPublished(rec({ publishAt: "2026-07-01T00:00:00Z" }), NOW)).toBe(
      true
    );
  });
  it("publishAt が未来なら未公開", () => {
    expect(isPublished(rec({ publishAt: "2026-07-20T00:00:00Z" }), NOW)).toBe(
      false
    );
  });
});

describe("isBannerEligible", () => {
  it("low はバナー対象外", () => {
    expect(isBannerEligible(rec({ type: "low" }))).toBe(false);
  });
  it("warning / info はバナー対象", () => {
    expect(isBannerEligible(rec({ type: "warning" }))).toBe(true);
    expect(isBannerEligible(rec({ type: "info" }))).toBe(true);
  });
});

describe("isPinnedNow", () => {
  it("公開済み・pinnedUntil 未到来ならバナー掲載中", () => {
    const a = rec({
      publishAt: "2026-07-01T00:00:00Z",
      pinnedUntil: "2026-07-20T00:00:00Z",
    });
    expect(isPinnedNow(a, NOW)).toBe(true);
  });
  it("pinnedUntil を過ぎたら非掲載", () => {
    const a = rec({ pinnedUntil: "2026-07-10T00:00:00Z" });
    expect(isPinnedNow(a, NOW)).toBe(false);
  });
  it("pinnedUntil が null でも、公開から7日以内なら既定でバナー掲載中", () => {
    // NOW=7/13。7/10 公開 + 7日 = 7/17 > NOW → 掲載中
    const a = rec({ publishAt: "2026-07-10T00:00:00Z", pinnedUntil: null });
    expect(isPinnedNow(a, NOW)).toBe(true);
  });
  it("pinnedUntil が null で、公開から7日を過ぎたら自動で非掲載", () => {
    // 7/01 公開 + 7日 = 7/08 < NOW(7/13) → 非掲載
    const a = rec({ publishAt: "2026-07-01T00:00:00Z", pinnedUntil: null });
    expect(isPinnedNow(a, NOW)).toBe(false);
  });
  it("未公開なら pinnedUntil が未来でも非掲載", () => {
    const a = rec({
      publishAt: "2026-07-20T00:00:00Z",
      pinnedUntil: "2026-07-30T00:00:00Z",
    });
    expect(isPinnedNow(a, NOW)).toBe(false);
  });
  it("low は pinnedUntil が未来でもバナーに出さない（要件4）", () => {
    const a = rec({ type: "low", pinnedUntil: "2026-07-30T00:00:00Z" });
    expect(isPinnedNow(a, NOW)).toBe(false);
  });
});

describe("bannerEndsAt", () => {
  it("pinnedUntil 指定時はその日時", () => {
    const a = rec({ pinnedUntil: "2026-07-20T00:00:00Z" });
    expect(bannerEndsAt(a)).toBe(Date.parse("2026-07-20T00:00:00Z"));
  });
  it("pinnedUntil 未指定なら公開日時+7日", () => {
    const a = rec({ publishAt: "2026-07-10T00:00:00Z", pinnedUntil: null });
    expect(bannerEndsAt(a)).toBe(
      Date.parse("2026-07-10T00:00:00Z") + 7 * 24 * 60 * 60 * 1000
    );
  });
});

describe("listForAnnouncementsPage", () => {
  it("未公開（予約）は一覧に出さず、公開済みを新しい順に並べる", () => {
    const all = [
      rec({ id: 1, publishAt: "2026-07-01T00:00:00Z" }),
      rec({ id: 2, publishAt: "2026-07-05T00:00:00Z" }),
      rec({ id: 3, publishAt: "2026-07-20T00:00:00Z" }), // 未公開
    ];
    const list = listForAnnouncementsPage(all, NOW);
    expect(list.map((a) => a.id)).toEqual([2, 1]);
  });
});

describe("bannerAnnouncements", () => {
  it("公開済み・banner対象・pin中のみを id 降順で返す", () => {
    const all = [
      // 掲載中（info, pin 未到来）
      rec({ id: 1, type: "info", pinnedUntil: "2026-07-20T00:00:00Z" }),
      // 掲載中（warning）
      rec({ id: 2, type: "warning", pinnedUntil: "2026-07-25T00:00:00Z" }),
      // low は除外
      rec({ id: 3, type: "low", pinnedUntil: "2026-07-25T00:00:00Z" }),
      // pin なし＝公開(7/01)+7日=7/08 が過去なので除外
      rec({ id: 4, type: "info", pinnedUntil: null }),
      // pin 過ぎは除外
      rec({ id: 5, type: "info", pinnedUntil: "2026-07-10T00:00:00Z" }),
      // 未公開は除外
      rec({
        id: 6,
        type: "info",
        publishAt: "2026-07-20T00:00:00Z",
        pinnedUntil: "2026-07-30T00:00:00Z",
      }),
    ];
    expect(bannerAnnouncements(all, NOW).map((a) => a.id)).toEqual([2, 1]);
  });
});

describe("formatAnnouncementDate", () => {
  it("JST で M/D を返す", () => {
    // UTC 2026-07-12T16:00Z = JST 2026-07-13 01:00
    expect(formatAnnouncementDate("2026-07-12T16:00:00Z")).toBe("7/13");
  });
  it("withYear で YYYY/M/D を返す", () => {
    expect(
      formatAnnouncementDate("2026-07-12T16:00:00Z", { withYear: true })
    ).toBe("2026/7/13");
  });
});

describe("既読 Cookie（parse / serialize / read 判定）", () => {
  it("新形式 '2:5-6-9' を id 集合として解釈する", () => {
    const s = parseAnnouncementReadState("2:5-6-9");
    expect(s.legacyMax).toBe(0);
    expect([...s.readIds].sort((a, b) => a - b)).toEqual([5, 6, 9]);
  });
  it("旧形式（単一整数）は高水位マークとして後方互換で扱う", () => {
    const s = parseAnnouncementReadState("6");
    expect(s.legacyMax).toBe(6);
    expect(s.readIds.size).toBe(0);
    expect(isAnnouncementRead(6, s)).toBe(true); // 6以下は既読
    expect(isAnnouncementRead(3, s)).toBe(true);
    expect(isAnnouncementRead(7, s)).toBe(false);
  });
  it("空/未設定は何も既読でない", () => {
    const s = parseAnnouncementReadState(null);
    expect(isAnnouncementRead(1, s)).toBe(false);
  });
  it("serialize は重複排除・昇順・不正値除去して '2:' 形式にする", () => {
    expect(serializeAnnouncementReadIds([9, 5, 5, 6])).toBe("2:5-6-9");
    expect(serializeAnnouncementReadIds([])).toBe("2:");
    expect(serializeAnnouncementReadIds([0, -1, 3])).toBe("2:3");
  });
  it("serialize→parse で往復する", () => {
    const s = parseAnnouncementReadState(serializeAnnouncementReadIds([7, 8]));
    expect(isAnnouncementRead(7, s)).toBe(true);
    expect(isAnnouncementRead(8, s)).toBe(true);
    expect(isAnnouncementRead(9, s)).toBe(false);
  });
});

describe("unreadBannerAnnouncements（予約分の取りこぼし防止）", () => {
  const A5 = rec({ id: 5 });
  const A6 = rec({ id: 6 });
  const A9 = rec({ id: 9 });

  it("既読集合に含まれない id だけ残す", () => {
    // 6 を既読にした状態で、後から公開された予約分 5 と新規 9 は未読として残る
    const cookie = serializeAnnouncementReadIds([6]);
    expect(unreadBannerAnnouncements([A5, A6, A9], cookie).map((a) => a.id)).toEqual([
      5, 9,
    ]);
  });

  it("旧形式の高水位マークだと予約分（小さいid）が取りこぼされる → 新形式では防げる", () => {
    // 旧: "6" は 5<=6 で既読扱い → 5 が消える（これが直したかったバグ）
    expect(unreadBannerAnnouncements([A5, A9], "6").map((a) => a.id)).toEqual([9]);
    // 新: id集合 {6} なら 5 は既読でない → 残る
    const cookie = serializeAnnouncementReadIds([6]);
    expect(unreadBannerAnnouncements([A5, A9], cookie).map((a) => a.id)).toEqual([
      5, 9,
    ]);
  });

  it("Cookie は現在バナー対象の件数に張り付く（× で置換＝肥大化しない）", () => {
    // × を押すたび「現在アクティブな id だけ」を保存する運用を模す。
    // 掲載が入れ替わっても集合は同時掲載件数どまりで、蓄積しない。
    let cookie = serializeAnnouncementReadIds([7, 8]); // このとき掲載は 7,8
    expect(cookie).toBe("2:7-8");
    // 7,8 が失効し 20,21 が掲載中に。× を押すと現在アクティブ [20,21] で置換。
    const nowActive = [20, 21];
    cookie = serializeAnnouncementReadIds(nowActive);
    expect(cookie).toBe("2:20-21"); // 7,8 は残らない（2件のまま）
  });
});

describe("toAnnouncementRecord", () => {
  it("Date を ISO に正規化し type を丸める", () => {
    const r = toAnnouncementRecord({
      id: 7,
      type: "unknown",
      message: "m",
      detail: null,
      publishAt: new Date("2026-07-01T00:00:00Z"),
      pinnedUntil: null,
      createdAt: new Date("2026-07-01T00:00:00Z"),
    });
    expect(r.type).toBe("info");
    expect(r.publishAt).toBe("2026-07-01T00:00:00.000Z");
    expect(r.pinnedUntil).toBeNull();
  });
});
