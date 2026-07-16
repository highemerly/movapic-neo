/**
 * 再投稿ルート POST /api/v1/images/:id/repost のテスト。
 *
 * 認証・レート制限・visibility 検証・repostImage の結果→HTTP マッピングを固定する。
 * repostImage 本体はモックし、ここではルートの分岐だけ検証する。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserWithValidation: vi.fn(),
}));
vi.mock("@/lib/postRateLimit", () => ({ checkPostRateLimit: vi.fn() }));
vi.mock("@/lib/auth/tokens", () => ({
  decryptToken: vi.fn((t: string) => `dec:${t}`),
}));
vi.mock("@/lib/publish/repostImage", () => ({ repostImage: vi.fn() }));

import { getCurrentUserWithValidation } from "@/lib/auth/session";
import { checkPostRateLimit } from "@/lib/postRateLimit";
import { repostImage } from "@/lib/publish/repostImage";
import { POST } from "./route";

const mockAuth = vi.mocked(getCurrentUserWithValidation);
const mockRateLimit = vi.mocked(checkPostRateLimit);
const mockRepost = vi.mocked(repostImage);

type SessionUser = Awaited<ReturnType<typeof getCurrentUserWithValidation>>;

const USER = {
  id: "user-1",
  username: "alice",
  accessToken: "enc",
  autoMakeup: false,
  instance: { domain: "mastodon.example", type: "mastodon" },
} as unknown as NonNullable<SessionUser>;

function makeReq(body: unknown = { visibility: "public" }): NextRequest {
  return new NextRequest("http://localhost/api/v1/images/img/repost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "img" });

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(USER);
  mockRateLimit.mockResolvedValue({ allowed: true });
  mockRepost.mockResolvedValue({
    ok: true,
    postUrl: "https://mastodon.example/@alice/s1",
  });
});

describe("POST /api/v1/images/:id/repost", () => {
  it("未認証は401", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(401);
    expect(mockRepost).not.toHaveBeenCalled();
  });

  it("レート制限超過は429", async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(mockRepost).not.toHaveBeenCalled();
  });

  it("visibility=local は400で弾く", async () => {
    const res = await POST(makeReq({ visibility: "local" }), { params });
    expect(res.status).toBe(400);
    expect(mockRepost).not.toHaveBeenCalled();
  });

  it("not_found は404", async () => {
    mockRepost.mockResolvedValue({ ok: false, failure: "not_found" });
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(404);
  });

  it("forbidden は403", async () => {
    mockRepost.mockResolvedValue({ ok: false, failure: "forbidden" });
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(403);
  });

  it("already_posted は409", async () => {
    mockRepost.mockResolvedValue({ ok: false, failure: "already_posted" });
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(409);
  });

  it("too_old は409", async () => {
    mockRepost.mockResolvedValue({ ok: false, failure: "too_old" });
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(409);
  });

  it("no_image_data は500", async () => {
    mockRepost.mockResolvedValue({ ok: false, failure: "no_image_data" });
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(500);
  });

  it("成功時は200＋postUrl、復号トークンで repostImage を呼ぶ", async () => {
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.postUrl).toBe("https://mastodon.example/@alice/s1");
    // 復号済みトークンが渡っていること
    expect(mockRepost.mock.calls[0][0].user.accessToken).toBe("dec:enc");
    expect(mockRepost.mock.calls[0][0].visibility).toBe("public");
  });

  it("連合投稿だけ失敗（部分的成功）は200＋fediverseError", async () => {
    mockRepost.mockResolvedValue({
      ok: true,
      postError: "server error",
      postErrorStatus: 503,
    });
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.fediverseError).toBe("server error");
    expect(body.fediverseErrorStatus).toBe(503);
  });
});
