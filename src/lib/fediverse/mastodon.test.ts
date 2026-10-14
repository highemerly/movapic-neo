/**
 * searchResolveStatusId のテスト（fetch をモック）。
 * お気に入り側が依存する契約: 該当なし=null・!ok=SearchResolveError・ネットワーク例外は素通し。
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { searchResolveStatusId, SearchResolveError } from "./mastodon";

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const mock = vi.fn(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function json(data: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchResolveStatusId", () => {
  it("viewer のサーバーで search?resolve=true を叩き、先頭の status ID を返す", async () => {
    const fetchMock = stubFetch(async () => json({ statuses: [{ id: "123" }] }));

    await expect(
      searchResolveStatusId("viewer.example", "tok", "https://owner.example/@bob/1")
    ).resolves.toBe("123");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://viewer.example/api/v2/search?q=https%3A%2F%2Fowner.example%2F%40bob%2F1&resolve=true&type=statuses&limit=1"
    );
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("該当なしは null", async () => {
    stubFetch(async () => json({ statuses: [] }));
    await expect(searchResolveStatusId("v.example", "tok", "u")).resolves.toBeNull();
  });

  it("HTTP エラーは SearchResolveError（ステータス付き）", async () => {
    stubFetch(async () => json({}, 401));
    const error = await searchResolveStatusId("v.example", "tok", "u").catch((e) => e);
    expect(error).toBeInstanceOf(SearchResolveError);
    expect(error.status).toBe(401);
  });

  it("ネットワーク例外は包まずそのまま投げる", async () => {
    const boom = new TypeError("fetch failed");
    stubFetch(async () => {
      throw boom;
    });
    await expect(searchResolveStatusId("v.example", "tok", "u")).rejects.toBe(boom);
  });
});
