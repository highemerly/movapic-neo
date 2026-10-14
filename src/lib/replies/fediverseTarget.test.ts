/**
 * リプライ先の Fediverse ID 解決（resolveFediverseReplyTarget）のテスト。
 * 親の状態・投稿者と親のサーバーの組み合わせごとの結果と、throw しないことを固定する。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { findUnique, searchResolveStatusId, apShowNoteId } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  searchResolveStatusId: vi.fn(),
  apShowNoteId: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: { image: { findUnique } } }));

vi.mock("@/lib/fediverse/mastodon", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fediverse/mastodon")>(
    "@/lib/fediverse/mastodon"
  );
  return { ...actual, searchResolveStatusId };
});

vi.mock("@/lib/fediverse/misskey", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fediverse/misskey")>(
    "@/lib/fediverse/misskey"
  );
  return { ...actual, apShowNoteId };
});

import { resolveFediverseReplyTarget, REPLY_RESOLVE_TIMEOUT_MS } from "./fediverseTarget";
import { SearchResolveError } from "@/lib/fediverse/mastodon";
import { ApShowError } from "@/lib/fediverse/misskey";

const MASTODON_VIEWER = { domain: "mastodon.example", type: "mastodon", accessToken: "tok" };
const MISSKEY_VIEWER = { domain: "misskey.example", type: "misskey", accessToken: "tok" };

function parent(domain: string, over: Record<string, unknown> = {}) {
  return {
    postId: "owner-post-1",
    postUrl: `https://${domain}/@bob/owner-post-1`,
    user: { instance: { domain } },
    ...over,
  };
}

const resolve = (viewer: typeof MASTODON_VIEWER) =>
  resolveFediverseReplyTarget({ replyToImageId: "parent-img", viewer });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("resolveFediverseReplyTarget", () => {
  it("親が既に無ければ parent-gone", async () => {
    findUnique.mockResolvedValue(null);
    await expect(resolve(MASTODON_VIEWER)).resolves.toEqual({
      kind: "shamezo-only",
      reason: "parent-gone",
    });
  });

  it("親が連合していなければ（local・投稿失敗）parent-not-federated", async () => {
    findUnique.mockResolvedValue(parent("mastodon.example", { postId: null, postUrl: null }));
    await expect(resolve(MASTODON_VIEWER)).resolves.toEqual({
      kind: "shamezo-only",
      reason: "parent-not-federated",
    });
  });

  it("親と同じサーバーなら postId をそのまま使う（解決の往復をしない）", async () => {
    findUnique.mockResolvedValue(parent("mastodon.example"));
    await expect(resolve(MASTODON_VIEWER)).resolves.toEqual({
      kind: "linked",
      postId: "owner-post-1",
    });
    expect(searchResolveStatusId).not.toHaveBeenCalled();
  });

  it("別サーバーの Mastodon 投稿者は search?resolve で解決する", async () => {
    findUnique.mockResolvedValue(parent("other.example"));
    searchResolveStatusId.mockResolvedValue("local-status-9");

    await expect(resolve(MASTODON_VIEWER)).resolves.toEqual({
      kind: "linked",
      postId: "local-status-9",
    });
    expect(searchResolveStatusId).toHaveBeenCalledWith(
      "mastodon.example",
      "tok",
      "https://other.example/@bob/owner-post-1",
      REPLY_RESOLVE_TIMEOUT_MS
    );
  });

  it("別サーバーの Misskey 投稿者は ap/show で解決する", async () => {
    findUnique.mockResolvedValue(parent("other.example"));
    apShowNoteId.mockResolvedValue("local-note-9");

    await expect(resolve(MISSKEY_VIEWER)).resolves.toEqual({
      kind: "linked",
      postId: "local-note-9",
    });
    expect(apShowNoteId).toHaveBeenCalledWith(
      "misskey.example",
      "tok",
      "https://other.example/@bob/owner-post-1",
      REPLY_RESOLVE_TIMEOUT_MS
    );
  });

  it("見つからなければ unresolved", async () => {
    findUnique.mockResolvedValue(parent("other.example"));
    searchResolveStatusId.mockResolvedValue(null);
    await expect(resolve(MASTODON_VIEWER)).resolves.toEqual({
      kind: "shamezo-only",
      reason: "unresolved",
    });
  });

  it("HTTP エラーは throw せず resolve-failed（ステータス付き）", async () => {
    findUnique.mockResolvedValue(parent("other.example"));
    searchResolveStatusId.mockRejectedValue(new SearchResolveError(503));
    await expect(resolve(MASTODON_VIEWER)).resolves.toEqual({
      kind: "shamezo-only",
      reason: "resolve-failed",
      status: 503,
    });
  });

  it("Misskey の接続失敗（ApShowError status=0）も resolve-failed", async () => {
    findUnique.mockResolvedValue(parent("other.example"));
    apShowNoteId.mockRejectedValue(new ApShowError(0));
    await expect(resolve(MISSKEY_VIEWER)).resolves.toEqual({
      kind: "shamezo-only",
      reason: "resolve-failed",
      status: 0,
    });
  });

  it("タイムアウト等の素の例外も throw せず resolve-failed", async () => {
    findUnique.mockResolvedValue(parent("other.example"));
    searchResolveStatusId.mockRejectedValue(new Error("The operation was aborted due to timeout"));
    await expect(resolve(MASTODON_VIEWER)).resolves.toEqual({
      kind: "shamezo-only",
      reason: "resolve-failed",
      status: undefined,
    });
  });
});
