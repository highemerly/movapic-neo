import { afterEach, describe, it, expect, vi } from "vitest";
import { resolveLoginRedirect } from "./loginRedirect";

afterEach(() => {
  vi.unstubAllEnvs();
});

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

  it("既定センチネル＋既存ユーザーは自分のユーザーページへ送る（ホームインスタンスは素のusername）", () => {
    vi.stubEnv("HOME_SERVER", "handon.club");
    expect(
      resolveLoginRedirect("/dashboard", {
        isNewUser: false,
        username: "alice",
        instanceDomain: "handon.club",
      })
    ).toBe("/u/alice");
  });

  it("ホームインスタンス以外は username@domain 形式のパスになる", () => {
    vi.stubEnv("HOME_SERVER", "handon.club");
    expect(
      resolveLoginRedirect("/dashboard", {
        isNewUser: false,
        username: "bob",
        instanceDomain: "misskey.io",
      })
    ).toBe("/u/bob@misskey.io");
  });

  it("HOME_SERVER 未設定なら常に username@domain 形式のパスになる", () => {
    expect(
      resolveLoginRedirect("/dashboard", {
        isNewUser: false,
        username: "alice",
        instanceDomain: "handon.club",
      })
    ).toBe("/u/alice@handon.club");
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
