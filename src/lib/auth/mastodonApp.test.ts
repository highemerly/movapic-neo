import { describe, it, expect, vi, beforeEach } from "vitest";

const { userFindUnique, revokeMastodonToken } = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  revokeMastodonToken: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: { user: { findUnique: userFindUnique } } }));
vi.mock("@/lib/auth/fediverse", () => ({ registerMastodonApp: vi.fn(), revokeMastodonToken }));
vi.mock("@/lib/auth/tokens", () => ({
  encryptToken: vi.fn((t: string) => `enc:${t}`),
  decryptToken: vi.fn((t: string) => t.replace(/^enc:/, "")),
}));

import { revokeUserMastodonToken } from "./mastodonApp";

const userRow = (instance: Record<string, unknown>) => ({
  accessToken: "enc:user-token",
  instance: { type: "mastodon", domain: "mastodon.example", clientId: "enc:cid", clientSecret: "enc:secret", ...instance },
});

beforeEach(() => {
  vi.clearAllMocks();
  revokeMastodonToken.mockResolvedValue(undefined);
});

describe("revokeUserMastodonToken", () => {
  it("Mastodon は保存済みのアプリ資格情報（復号して）でトークンを失効させる", async () => {
    userFindUnique.mockResolvedValue(userRow({}));
    expect(await revokeUserMastodonToken("u1")).toBe(true);
    expect(revokeMastodonToken).toHaveBeenCalledWith("mastodon.example", "cid", "secret", "user-token");
  });

  it("Misskey は失効させる API が無いので何もしない", async () => {
    userFindUnique.mockResolvedValue(userRow({ type: "misskey" }));
    expect(await revokeUserMastodonToken("u1")).toBe(false);
    expect(revokeMastodonToken).not.toHaveBeenCalled();
  });

  it("アプリ資格情報が無ければ（失効させられないので）何もしない", async () => {
    userFindUnique.mockResolvedValue(userRow({ clientId: null, clientSecret: null }));
    expect(await revokeUserMastodonToken("u1")).toBe(false);
    expect(revokeMastodonToken).not.toHaveBeenCalled();
  });

  it("サーバーが失効を拒否したら throw する（退会を続けるかは呼び出し側が決める）", async () => {
    userFindUnique.mockResolvedValue(userRow({}));
    revokeMastodonToken.mockRejectedValue(new Error("トークン無効化に失敗しました: forbidden"));
    await expect(revokeUserMastodonToken("u1")).rejects.toThrow("トークン無効化に失敗しました");
  });
});
