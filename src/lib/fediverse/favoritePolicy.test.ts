import { describe, it, expect } from "vitest";
import {
  computeCacheTtl,
  shouldSyncOnGet,
  isFavoriteSyncDue,
  MIN_MS,
  HOUR_MS,
  DAY_MS,
  MATURE_DAYS,
} from "./favoritePolicy";

// 固定の現在時刻（テストの決定性のため）
const NOW = Date.UTC(2026, 0, 15, 0, 0, 0);
const ago = (ms: number) => new Date(NOW - ms);
const createdAgo = (ms: number) => ago(ms);
/** createdAt から markDays 日後の日時（成功syncマークの基準） */
const syncedAtMark = (createdAt: Date, markDays: number) =>
  new Date(createdAt.getTime() + markDays * DAY_MS);

describe("computeCacheTtl - 経過時間ベースのTTL（postStatus=200/null）", () => {
  const ttl = (ageMs: number, syncedAt: Date | null = null) =>
    computeCacheTtl(createdAgo(ageMs), null, syncedAt, NOW);

  it("5分以内 → 1分", () => {
    expect(ttl(1 * MIN_MS)).toBe(1 * MIN_MS);
    expect(ttl(5 * MIN_MS)).toBe(1 * MIN_MS); // 境界
  });

  it("5分超〜1時間以内 → 5分", () => {
    expect(ttl(5 * MIN_MS + 1)).toBe(5 * MIN_MS); // 境界直後
    expect(ttl(30 * MIN_MS)).toBe(5 * MIN_MS);
    expect(ttl(1 * HOUR_MS)).toBe(5 * MIN_MS); // 境界
  });

  it("1時間超〜3時間以内 → 10分", () => {
    expect(ttl(1 * HOUR_MS + 1)).toBe(10 * MIN_MS);
    expect(ttl(2 * HOUR_MS)).toBe(10 * MIN_MS);
    expect(ttl(3 * HOUR_MS)).toBe(10 * MIN_MS); // 境界
  });

  it("3時間超〜1日以内 → 1時間", () => {
    expect(ttl(3 * HOUR_MS + 1)).toBe(1 * HOUR_MS);
    expect(ttl(12 * HOUR_MS)).toBe(1 * HOUR_MS);
    expect(ttl(1 * DAY_MS)).toBe(1 * HOUR_MS); // 境界
  });

  it("1日超〜14日以内 → 1日", () => {
    expect(ttl(1 * DAY_MS + 1)).toBe(1 * DAY_MS);
    expect(ttl(7 * DAY_MS)).toBe(1 * DAY_MS);
    expect(ttl(MATURE_DAYS * DAY_MS)).toBe(1 * DAY_MS); // 境界（14日）
  });

  describe("14日超", () => {
    it("成熟後（createdAt+14日 以降）の成功syncがあれば Infinity（停止）", () => {
      const createdAt = createdAgo(16 * DAY_MS);
      const matured = syncedAtMark(createdAt, MATURE_DAYS); // ちょうど14日マーク
      expect(computeCacheTtl(createdAt, 200, matured, NOW)).toBe(Infinity);
    });

    it("若い頃のsyncしか無ければ 0（即stale）＝最終syncを1回走らせる", () => {
      const createdAt = createdAgo(16 * DAY_MS);
      const early = syncedAtMark(createdAt, 1); // day1 の sync（14日マーク未満）
      expect(computeCacheTtl(createdAt, 200, early, NOW)).toBe(0);
    });

    it("一度もsyncしていなければ 0", () => {
      expect(ttl(16 * DAY_MS, null)).toBe(0);
    });
  });
});

describe("computeCacheTtl - postStatusベース（経過時間より優先）", () => {
  // 経過時間に依らず postStatus で決まることを確認するため age=7日固定
  const ttl = (status: number | null) =>
    computeCacheTtl(createdAgo(7 * DAY_MS), status, null, NOW);

  it("429 / 5xx / 0(接続失敗) → 1時間", () => {
    expect(ttl(429)).toBe(1 * HOUR_MS);
    expect(ttl(500)).toBe(1 * HOUR_MS);
    expect(ttl(503)).toBe(1 * HOUR_MS);
    expect(ttl(0)).toBe(1 * HOUR_MS);
  });

  it("4xx（429除く）→ 1日", () => {
    expect(ttl(400)).toBe(1 * DAY_MS);
    expect(ttl(403)).toBe(1 * DAY_MS);
    expect(ttl(404)).toBe(1 * DAY_MS);
    expect(ttl(410)).toBe(1 * DAY_MS);
  });
});

describe("shouldSyncOnGet - TTL未満は取得しない / 超過で取得する", () => {
  it("未sync（favoritesSyncedAt=null）は常に取得する", () => {
    expect(shouldSyncOnGet(createdAgo(7 * DAY_MS), null, null, NOW)).toBe(true);
  });

  it("TTL未満 → 取得しない（false）", () => {
    // age=30分 → TTL5分。1分前にsync済み → 未超過
    const createdAt = createdAgo(30 * MIN_MS);
    const syncedAt = ago(1 * MIN_MS);
    expect(shouldSyncOnGet(createdAt, 200, syncedAt, NOW)).toBe(false);
  });

  it("TTL超過 → 取得する（true）", () => {
    // age=30分 → TTL5分。10分前にsync済み → 超過
    const createdAt = createdAgo(30 * MIN_MS);
    const syncedAt = ago(10 * MIN_MS);
    expect(shouldSyncOnGet(createdAt, 200, syncedAt, NOW)).toBe(true);
  });

  it("TTL丁度（境界）は取得しない（厳密に超過したときだけ取得）", () => {
    // age=30分 → TTL5分。ちょうど5分前 → now-synced == ttl で「超過」ではない
    const createdAt = createdAgo(30 * MIN_MS);
    const syncedAt = ago(5 * MIN_MS);
    expect(shouldSyncOnGet(createdAt, 200, syncedAt, NOW)).toBe(false);
  });

  it("14日超＋成熟後syncあり → Infinity で取得しない", () => {
    const createdAt = createdAgo(16 * DAY_MS);
    const matured = syncedAtMark(createdAt, MATURE_DAYS);
    expect(shouldSyncOnGet(createdAt, 200, matured, NOW)).toBe(false);
  });

  it("14日超＋若い頃のsyncのみ → 取得する（最終syncを走らせる：day16に開いたケース）", () => {
    const createdAt = createdAgo(16 * DAY_MS);
    const early = syncedAtMark(createdAt, 1);
    expect(shouldSyncOnGet(createdAt, 200, early, NOW)).toBe(true);
  });
});

describe("isFavoriteSyncDue - fire1/fire2 の発火条件", () => {
  describe("共通の足切り", () => {
    it("投稿から1日未満 → 発火しない", () => {
      expect(isFavoriteSyncDue({ createdAt: createdAgo(12 * HOUR_MS), favoritesSyncedAt: null, postStatus: null }, NOW)).toBe(false);
    });

    it("ちょうど1日経過＋未sync → 発火する（境界）", () => {
      expect(isFavoriteSyncDue({ createdAt: createdAgo(1 * DAY_MS), favoritesSyncedAt: null, postStatus: null }, NOW)).toBe(true);
    });

  });

  describe("バックオフ（成功=12時間 / 失敗=1時間）", () => {
    // 成功(200)が fire1 対象であり続けるには「1日マーク未満の成功」である必要がある。
    // age=30時間 → 1日マークは now-6時間。よって synced が now-6h より前かつ
    // バックオフ境界(12h)をまたぐように 8h/13h 前を使うと、バックオフだけを切り分けられる。
    const created = createdAgo(30 * HOUR_MS);
    const successBeforeMark = (syncedAgoMs: number) => ({
      createdAt: created,
      favoritesSyncedAt: ago(syncedAgoMs),
      postStatus: 200,
    });

    it("成功(200): 12時間以内は発火しない", () => {
      expect(isFavoriteSyncDue(successBeforeMark(8 * HOUR_MS), NOW)).toBe(false);
    });
    it("成功(200): 12時間超で発火", () => {
      expect(isFavoriteSyncDue(successBeforeMark(13 * HOUR_MS), NOW)).toBe(true);
    });

    it("失敗(5xx): 1時間以内は発火しない", () => {
      const createdAt = createdAgo(2 * DAY_MS);
      expect(isFavoriteSyncDue({ createdAt, favoritesSyncedAt: ago(30 * 60_000), postStatus: 503 }, NOW)).toBe(false);
    });
    it("失敗(5xx): 1時間超で発火（成功より早く再試行）", () => {
      const createdAt = createdAgo(2 * DAY_MS);
      expect(isFavoriteSyncDue({ createdAt, favoritesSyncedAt: ago(2 * HOUR_MS), postStatus: 503 }, NOW)).toBe(true);
    });
    it("失敗(429): 1時間超で発火", () => {
      const createdAt = createdAgo(2 * DAY_MS);
      expect(isFavoriteSyncDue({ createdAt, favoritesSyncedAt: ago(2 * HOUR_MS), postStatus: 429 }, NOW)).toBe(true);
    });
    it("接続失敗(0): 1時間超で発火", () => {
      const createdAt = createdAgo(2 * DAY_MS);
      expect(isFavoriteSyncDue({ createdAt, favoritesSyncedAt: ago(2 * HOUR_MS), postStatus: 0 }, NOW)).toBe(true);
    });
  });

  describe("fire1（1日経過後の初回成功syncまで）", () => {
    it("1日経過＋未sync → 発火", () => {
      expect(isFavoriteSyncDue({ createdAt: createdAgo(2 * DAY_MS), favoritesSyncedAt: null, postStatus: null }, NOW)).toBe(true);
    });

    it("1日経過後に成功sync済み → 発火しない（一回きり）", () => {
      const createdAt = createdAgo(2 * DAY_MS);
      const synced = syncedAtMark(createdAt, 1); // day1 に成功sync
      expect(isFavoriteSyncDue({ createdAt, favoritesSyncedAt: synced, postStatus: 200 }, NOW)).toBe(false);
    });

    it("1日経過後の sync が失敗(5xx) → 発火し続ける（再試行）", () => {
      const createdAt = createdAgo(2 * DAY_MS);
      const synced = syncedAtMark(createdAt, 1);
      expect(isFavoriteSyncDue({ createdAt, favoritesSyncedAt: synced, postStatus: 503 }, NOW)).toBe(true);
    });

    it("成功syncが1日マーク未満（投稿直後）→ まだ発火（落ち着いてから1回拾う）", () => {
      const createdAt = createdAgo(2 * DAY_MS);
      const synced = new Date(createdAt.getTime() + 12 * HOUR_MS); // day0.5 の成功
      expect(isFavoriteSyncDue({ createdAt, favoritesSyncedAt: synced, postStatus: 200 }, NOW)).toBe(true);
    });
  });

  describe("fire2（14日経過後の最終成功syncまで）", () => {
    it("16日経過＋day1の成功syncだけ → 発火（成熟後の最終sync：day16に未閲覧でも拾う）", () => {
      const createdAt = createdAgo(16 * DAY_MS);
      const synced = syncedAtMark(createdAt, 1);
      expect(isFavoriteSyncDue({ createdAt, favoritesSyncedAt: synced, postStatus: 200 }, NOW)).toBe(true);
    });

    it("16日経過＋14日マーク以降に成功sync済み → 発火しない（恒久停止）", () => {
      const createdAt = createdAgo(16 * DAY_MS);
      const synced = syncedAtMark(createdAt, 15); // day15 の成功
      expect(isFavoriteSyncDue({ createdAt, favoritesSyncedAt: synced, postStatus: 200 }, NOW)).toBe(false);
    });

    it("16日経過＋成熟sync済みでも 14日マーク丁度なら停止（境界）", () => {
      const createdAt = createdAgo(16 * DAY_MS);
      const synced = syncedAtMark(createdAt, MATURE_DAYS);
      expect(isFavoriteSyncDue({ createdAt, favoritesSyncedAt: synced, postStatus: 200 }, NOW)).toBe(false);
    });

    it("16日経過＋14日以降の sync が失敗 → 発火し続ける（再試行）", () => {
      const createdAt = createdAgo(16 * DAY_MS);
      const synced = syncedAtMark(createdAt, 15);
      expect(isFavoriteSyncDue({ createdAt, favoritesSyncedAt: synced, postStatus: 503 }, NOW)).toBe(true);
    });

    it("14日以降の失敗syncでも1時間以内なら発火しない（バックオフ優先）", () => {
      const createdAt = createdAgo(16 * DAY_MS);
      expect(isFavoriteSyncDue({ createdAt, favoritesSyncedAt: ago(30 * 60_000), postStatus: 503 }, NOW)).toBe(false);
    });

    it("20日経過＋未sync → 発火", () => {
      expect(isFavoriteSyncDue({ createdAt: createdAgo(20 * DAY_MS), favoritesSyncedAt: null, postStatus: null }, NOW)).toBe(true);
    });
  });
});
