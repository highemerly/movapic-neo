import { describe, it, expect } from "vitest";
import { parseUserHandle, userPathSegment, DEFAULT_INSTANCE } from "./userHandle";

describe("parseUserHandle", () => {
  it("素の username は既定インスタンス扱い", () => {
    expect(parseUserHandle("alice")).toEqual({ username: "alice", domain: DEFAULT_INSTANCE });
  });

  it("username@domain を分解する", () => {
    expect(parseUserHandle("alice@example.com")).toEqual({
      username: "alice",
      domain: "example.com",
    });
  });

  it("先頭の @ は除去する", () => {
    expect(parseUserHandle("@alice")).toEqual({ username: "alice", domain: DEFAULT_INSTANCE });
    expect(parseUserHandle("@alice@example.com")).toEqual({
      username: "alice",
      domain: "example.com",
    });
  });

  it("%40 エンコード（Next のルートパラメータ）をデコードして分解する", () => {
    expect(parseUserHandle("%40alice%40example.com")).toEqual({
      username: "alice",
      domain: "example.com",
    });
  });

  it("最後の @ を区切りにする（username に _ を許容）", () => {
    expect(parseUserHandle("foo_bar@mastodon.social")).toEqual({
      username: "foo_bar",
      domain: "mastodon.social",
    });
  });

  it("不正な % シーケンスはそのまま扱う（例外にしない）", () => {
    expect(parseUserHandle("bad%zz")).toEqual({ username: "bad%zz", domain: DEFAULT_INSTANCE });
  });
});

describe("userPathSegment", () => {
  it("既定インスタンスは素の username", () => {
    expect(userPathSegment("alice", DEFAULT_INSTANCE)).toBe("alice");
  });

  it("他インスタンスは username@domain", () => {
    expect(userPathSegment("alice", "example.com")).toBe("alice@example.com");
  });

  it("parseUserHandle と往復して一致する", () => {
    for (const seg of ["alice", "bob@example.com", "carol@mastodon.social"]) {
      const h = parseUserHandle(seg);
      expect(userPathSegment(h.username, h.domain)).toBe(seg);
    }
  });
});
