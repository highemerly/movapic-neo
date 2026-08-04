/**
 * 存在しないユーザーページで pathname からハンドルを復元する resolveMissingUser の回帰テスト。
 * 外部リンク（https://domain/@username）を出す判断を担うため、不正な形を弾くケースを厚めに見る。
 */

import { describe, it, expect } from "vitest";
import { resolveMissingUser, resolveMissingUserTab } from "./missingUser";

describe("resolveMissingUser", () => {
  it("username@domain のセグメントからハンドルとプロフィールURLを組み立てる", () => {
    expect(resolveMissingUser("/u/alice@example.com", "shamezo.example")).toEqual({
      username: "alice",
      domain: "example.com",
      handle: "alice@example.com",
      profileUrl: "https://example.com/@alice",
    });
  });

  it("ドメイン省略のセグメントは HOME_SERVER 所属として解決する", () => {
    expect(resolveMissingUser("/u/alice", "shamezo.example")).toEqual({
      username: "alice",
      domain: "shamezo.example",
      handle: "alice@shamezo.example",
      profileUrl: "https://shamezo.example/@alice",
    });
  });

  it("タブ配下（/photos など）のパスでもセグメントを拾う", () => {
    expect(resolveMissingUser("/u/alice@example.com/photos", undefined)?.handle).toBe(
      "alice@example.com"
    );
  });

  it("`@` がパーセントエンコードされていても解決できる", () => {
    expect(resolveMissingUser("/u/alice%40example.com", undefined)?.profileUrl).toBe(
      "https://example.com/@alice"
    );
  });

  it("先頭の `@` 付き（/u/@alice@example.com）も許容する", () => {
    expect(resolveMissingUser("/u/@alice@example.com", undefined)?.handle).toBe(
      "alice@example.com"
    );
  });

  it("HOME_SERVER 未設定でドメイン省略のセグメントは解決不能", () => {
    expect(resolveMissingUser("/u/alice", undefined)).toBeNull();
  });

  it("/u/ 配下でないパスは対象外", () => {
    expect(resolveMissingUser("/public", "shamezo.example")).toBeNull();
  });

  it("セグメントが無いパスは対象外", () => {
    expect(resolveMissingUser("/u/", "shamezo.example")).toBeNull();
  });

  it("username に使えない文字が混ざるセグメントはリンクを作らない", () => {
    expect(resolveMissingUser("/u/al ice@example.com", undefined)).toBeNull();
    expect(resolveMissingUser("/u/<script>@example.com", undefined)).toBeNull();
  });

  it("ドメインの形が不正なセグメントはリンクを作らない", () => {
    expect(resolveMissingUser("/u/alice@example", undefined)).toBeNull();
    expect(resolveMissingUser("/u/alice@exa mple.com", undefined)).toBeNull();
    expect(resolveMissingUser("/u/alice@-example.com", undefined)).toBeNull();
  });
});

describe("resolveMissingUserTab", () => {
  it("タブセグメントをそのままタブキーにする", () => {
    expect(resolveMissingUserTab("/u/alice/photos")).toBe("photos");
    expect(resolveMissingUserTab("/u/alice/calendar")).toBe("calendar");
    expect(resolveMissingUserTab("/u/alice/map")).toBe("map");
    expect(resolveMissingUserTab("/u/alice/achievements")).toBe("achievements");
  });

  it("タブ指定なしはホーム", () => {
    expect(resolveMissingUserTab("/u/alice")).toBe("home");
  });

  it("知らないセグメントはホーム扱い", () => {
    expect(resolveMissingUserTab("/u/alice/status")).toBe("home");
  });
});
