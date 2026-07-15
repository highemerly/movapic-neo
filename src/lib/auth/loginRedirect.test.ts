import { describe, it, expect } from "vitest";
import { resolveLoginRedirect } from "./loginRedirect";

describe("resolveLoginRedirect", () => {
  it("既定センチネル(/dashboard)＋新規ユーザーは初回投稿へ送る", () => {
    expect(
      resolveLoginRedirect("/dashboard", {
        isNewUser: true,
        username: "alice",
        instanceDomain: "handon.club",
      })
    ).toBe("/create?welcome=1");
  });

  it("既定センチネル＋既存ユーザーは自分のユーザーページへ送る（既定インスタンスは素のusername）", () => {
    expect(
      resolveLoginRedirect("/dashboard", {
        isNewUser: false,
        username: "alice",
        instanceDomain: "handon.club",
      })
    ).toBe("/u/alice");
  });

  it("既定インスタンス以外は username@domain 形式のパスになる", () => {
    expect(
      resolveLoginRedirect("/dashboard", {
        isNewUser: false,
        username: "bob",
        instanceDomain: "misskey.io",
      })
    ).toBe("/u/bob@misskey.io");
  });

  it("明示的な returnTo が渡っていれば新規/既存に関わらず尊重する", () => {
    expect(
      resolveLoginRedirect("/create", {
        isNewUser: true,
        username: "alice",
        instanceDomain: "handon.club",
      })
    ).toBe("/create");
    expect(
      resolveLoginRedirect("/favorite", {
        isNewUser: false,
        username: "alice",
        instanceDomain: "handon.club",
      })
    ).toBe("/favorite");
  });
});
