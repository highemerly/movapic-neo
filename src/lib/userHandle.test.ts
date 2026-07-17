import { describe, it, expect } from "vitest";
import { parseUserHandle, userPathSegment } from "./userHandle";

const HOME = "handon.club";

describe("parseUserHandle", () => {
  it("素の username はホームインスタンス扱い（homeServer 指定時）", () => {
    expect(parseUserHandle("alice", HOME)).toEqual({ username: "alice", domain: HOME });
  });

  it("homeServer 未設定なら素の username は解決不能（null）", () => {
    expect(parseUserHandle("alice", undefined)).toBeNull();
  });

  it("username@domain を分解する（homeServer 未設定でも可）", () => {
    expect(parseUserHandle("alice@example.com", undefined)).toEqual({
      username: "alice",
      domain: "example.com",
    });
  });

  it("先頭の @ は除去する", () => {
    expect(parseUserHandle("@alice", HOME)).toEqual({ username: "alice", domain: HOME });
    expect(parseUserHandle("@alice@example.com", HOME)).toEqual({
      username: "alice",
      domain: "example.com",
    });
  });

  it("%40 エンコード（Next のルートパラメータ）をデコードして分解する", () => {
    expect(parseUserHandle("%40alice%40example.com", HOME)).toEqual({
      username: "alice",
      domain: "example.com",
    });
  });

  it("最後の @ を区切りにする（username に _ を許容）", () => {
    expect(parseUserHandle("foo_bar@mastodon.social", HOME)).toEqual({
      username: "foo_bar",
      domain: "mastodon.social",
    });
  });

  it("不正な % シーケンスはそのまま扱う（例外にしない）", () => {
    expect(parseUserHandle("bad%zz", HOME)).toEqual({ username: "bad%zz", domain: HOME });
  });
});

describe("userPathSegment", () => {
  it("ホームインスタンスは素の username", () => {
    expect(userPathSegment("alice", HOME, HOME)).toBe("alice");
  });

  it("他インスタンスは username@domain", () => {
    expect(userPathSegment("alice", "example.com", HOME)).toBe("alice@example.com");
  });

  it("homeServer 未設定なら常に username@domain", () => {
    expect(userPathSegment("alice", HOME, undefined)).toBe(`alice@${HOME}`);
  });

  it("parseUserHandle と往復して一致する", () => {
    for (const seg of ["alice", "bob@example.com", "carol@mastodon.social"]) {
      const h = parseUserHandle(seg, HOME);
      expect(h).not.toBeNull();
      expect(userPathSegment(h!.username, h!.domain, HOME)).toBe(seg);
    }
  });
});
