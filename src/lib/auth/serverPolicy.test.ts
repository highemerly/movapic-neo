import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getLoginPlatforms,
  getAllowedServers,
  getDeniedServers,
  getHomeServer,
  getFavorServers,
} from "./serverPolicy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getLoginPlatforms", () => {
  it("未設定なら mastodon と misskey の両方を許可する", () => {
    vi.stubEnv("LOGIN_PLATFORM", "");
    expect(getLoginPlatforms()).toEqual(new Set(["mastodon", "misskey"]));
  });

  it("単一指定ならそのプラットフォームのみ許可する", () => {
    vi.stubEnv("LOGIN_PLATFORM", "mastodon");
    expect(getLoginPlatforms()).toEqual(new Set(["mastodon"]));
  });

  it("カンマ区切り・空白・大文字を許容する", () => {
    vi.stubEnv("LOGIN_PLATFORM", " Mastodon , MISSKEY ");
    expect(getLoginPlatforms()).toEqual(new Set(["mastodon", "misskey"]));
  });

  it("不明な値があれば throw する（typo をサイレントに無視しない）", () => {
    vi.stubEnv("LOGIN_PLATFORM", "mastodon,pleroma");
    expect(() => getLoginPlatforms()).toThrow(/pleroma/);
  });
});

describe("getAllowedServers", () => {
  it("未設定なら undefined（全許可）を返す", () => {
    vi.stubEnv("ALLOWED_SERVERS", "");
    expect(getAllowedServers()).toBeUndefined();
  });

  it("カンマ区切りを trim + 小文字化して返す", () => {
    vi.stubEnv("ALLOWED_SERVERS", " Handon.club , example.com ");
    expect(getAllowedServers()).toEqual(["handon.club", "example.com"]);
  });
});

describe("getDeniedServers", () => {
  it("未設定なら空配列を返す", () => {
    vi.stubEnv("DENIED_SERVERS", "");
    expect(getDeniedServers()).toEqual([]);
  });

  it("複数指定を小文字化して返す", () => {
    vi.stubEnv("DENIED_SERVERS", "Bad.example,evil.example");
    expect(getDeniedServers()).toEqual(["bad.example", "evil.example"]);
  });

  it("ログイン入力と同じ正規形にする（punycode・全角で書いても Instance.domain と一致する）", () => {
    vi.stubEnv("DENIED_SERVERS", "xn--wgv71a119e.jp,ｓpam.example,https://Evil.example/");
    expect(getDeniedServers()).toEqual(["日本語.jp", "spam.example", "evil.example"]);
  });

  it("ドメインとして解釈できない値があれば落とす（黙って無視すると拒否リストに穴が開く）", () => {
    vi.stubEnv("DENIED_SERVERS", "bad.example,evil.example:8443");
    expect(() => getDeniedServers()).toThrow(/DENIED_SERVERS/);
  });
});

describe("getHomeServer", () => {
  it("未設定なら undefined（短縮URL機能は無効）を返す", () => {
    vi.stubEnv("HOME_SERVER", "");
    expect(getHomeServer()).toBeUndefined();
  });

  it("単一値を trim + 小文字化して返す", () => {
    vi.stubEnv("HOME_SERVER", " Handon.club ");
    expect(getHomeServer()).toBe("handon.club");
  });

  it("カンマを含む（複数指定）場合は throw する", () => {
    vi.stubEnv("HOME_SERVER", "a.example,b.example");
    expect(() => getHomeServer()).toThrow(/単一/);
  });
});

describe("getFavorServers", () => {
  it("未設定なら空配列を返す", () => {
    vi.stubEnv("FAVOR_SERVERS", "");
    expect(getFavorServers()).toEqual([]);
  });

  it("複数指定を小文字化して返す", () => {
    vi.stubEnv("FAVOR_SERVERS", "handon.club,Friend.example");
    expect(getFavorServers()).toEqual(["handon.club", "friend.example"]);
  });
});
