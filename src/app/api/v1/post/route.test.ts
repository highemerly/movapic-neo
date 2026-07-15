import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 境界を全てモック（DB / R2 / Fediverse / compute / 逆ジオコーディングを読ませない）。
vi.mock("@/lib/auth/session", () => ({ getCurrentUserWithValidation: vi.fn() }));
vi.mock("@/lib/postRateLimit", () => ({ checkPostRateLimit: vi.fn() }));
vi.mock("@/lib/auth/tokens", () => ({ decryptToken: vi.fn((t: string) => `dec:${t}`) }));
vi.mock("@/lib/compute/client", () => ({ finalizeImage: vi.fn() }));
vi.mock("@/lib/publish/publishImage", () => ({ publishImage: vi.fn() }));
vi.mock("@/lib/geocode/gsi", () => ({ reverseGeocode: vi.fn() }));
vi.mock("@/lib/locations", () => ({ userHasPostedLocation: vi.fn() }));

import { POST } from "./route";
import { getCurrentUserWithValidation } from "@/lib/auth/session";
import { checkPostRateLimit } from "@/lib/postRateLimit";
import { finalizeImage } from "@/lib/compute/client";
import { publishImage } from "@/lib/publish/publishImage";
import { reverseGeocode } from "@/lib/geocode/gsi";
import { MAX_FILE_SIZE, MAX_TEXT_LENGTH } from "@/types";

const mockAuth = vi.mocked(getCurrentUserWithValidation);
const mockRateLimit = vi.mocked(checkPostRateLimit);
const mockFinalize = vi.mocked(finalizeImage);
const mockPublish = vi.mocked(publishImage);
const mockGeocode = vi.mocked(reverseGeocode);

type SessionUser = Awaited<ReturnType<typeof getCurrentUserWithValidation>>;
const USER = {
  id: "u1",
  username: "alice",
  accessToken: "enc-token",
  autoMakeup: false,
  instance: { domain: "mastodon.example", type: "mastodon" },
} as unknown as SessionUser;

const validImage = () => new File([new Uint8Array([1, 2, 3, 4])], "test.jpg", { type: "image/jpeg" });

function makeReq(overrides: Record<string, unknown> = {}): NextRequest {
  const fields: Record<string, unknown> = {
    image: validImage(),
    text: "こんにちは",
    position: "top",
    font: "hui-font",
    color: "white",
    size: "medium",
    output: "mastodon",
    visibility: "public",
    ...overrides,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined) continue;
    fd.set(k, v as string | Blob);
  }
  return new NextRequest("http://localhost/api/v1/post", { method: "POST", body: fd });
}

const finalizeOk = () => ({
  thumbnail: Buffer.from("thumb"),
  detectedMime: "image/jpeg",
  width: 800,
  height: 600,
  blurDataUrl: "data:image/webp;base64,xxx",
});

beforeEach(() => {
  mockAuth.mockReset();
  mockRateLimit.mockReset();
  mockFinalize.mockReset();
  mockPublish.mockReset();
  mockGeocode.mockReset();
  // 既定: 認証OK・レート制限OK・finalize成功・publish成功
  mockAuth.mockResolvedValue(USER);
  mockRateLimit.mockResolvedValue({ allowed: true });
  mockFinalize.mockResolvedValue(finalizeOk());
  mockPublish.mockResolvedValue({
    imageId: "img1",
    imagePageUrl: "/u/alice/status/img1",
    postUrl: "https://mastodon.example/@alice/1",
    newAchievements: [{ key: "first-post", category: "first-post", grantedAt: new Date() }],
  });
});

// post ルートは統一エラー形ではなく { error: string } を返す点に注意。
async function body(res: Response): Promise<Record<string, unknown>> {
  return res.json();
}

describe("POST /api/v1/post: 認証", () => {
  it("未認証は 401", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect((await body(res)).error).toBe("認証が必要です");
    expect(mockPublish).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/post: レート制限", () => {
  it("レート制限超過は 429（Retry-Afterヘッダー付き・画像処理せず）", async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, retryAfter: 120 });
    const res = await POST(makeReq());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    expect((await body(res)).error).toContain("投稿が多すぎます");
    // 重い処理の手前で弾く
    expect(mockFinalize).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/post: バリデーション", () => {
  it("必須パラメータ不足（text欠落）は 400", async () => {
    const res = await POST(makeReq({ text: null }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("必須パラメータが不足しています");
  });

  it("テキスト長すぎは 400", async () => {
    const res = await POST(makeReq({ text: "あ".repeat(MAX_TEXT_LENGTH + 1) }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toContain(`${MAX_TEXT_LENGTH}文字以下`);
  });

  it("ALTが1500字超は 400", async () => {
    const res = await POST(makeReq({ altText: "あ".repeat(1501) }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toContain("1500文字以下");
  });

  it("出力形式が不正は 400", async () => {
    const res = await POST(makeReq({ output: "twitter" }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toContain("出力形式");
  });

  it("位置が不正は 400", async () => {
    const res = await POST(makeReq({ position: "center" }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toContain("位置");
  });

  it("期間外シーズンは 400", async () => {
    const res = await POST(makeReq({ season: "nonexistent-season" }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("このシーズンは現在利用できません");
  });

  it("ファイルサイズ超過は 400", async () => {
    const big = new File([new Uint8Array(MAX_FILE_SIZE + 1)], "big.jpg", { type: "image/jpeg" });
    const res = await POST(makeReq({ image: big }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toContain("MB");
  });
});

describe("POST /api/v1/post: 画像解析（finalize）", () => {
  it("finalize が例外なら 400（画像の解析に失敗）", async () => {
    mockFinalize.mockRejectedValue(new Error("bad image"));
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("画像の解析に失敗しました");
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("未対応形式（detectedMime なし）は 400", async () => {
    mockFinalize.mockResolvedValue({ ...finalizeOk(), detectedMime: undefined });
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("サポートされていない画像形式です");
  });
});

describe("POST /api/v1/post: 成功", () => {
  it("投稿成功で imageId/URL/newAchievements を返す", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.success).toBe(true);
    expect(b.imageId).toBe("img1");
    expect(b.imagePageUrl).toBe("/u/alice/status/img1");
    expect(b.postUrl).toBe("https://mastodon.example/@alice/1");
    // 実績はキー/カテゴリのみに整形して返す（grantedAt は含めない）
    expect(b.newAchievements).toEqual([{ key: "first-post", category: "first-post" }]);
    // publish には復号済みトークンが渡る
    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockPublish.mock.calls[0][0].user.accessToken).toBe("dec:enc-token");
    expect(mockPublish.mock.calls[0][0].source).toBe("web");
  });

  it("Fediverseだけ失敗した部分成功は 200＋fediverseError", async () => {
    mockPublish.mockResolvedValue({
      imageId: "img2",
      imagePageUrl: "/u/alice/status/img2",
      postError: "connect timeout",
      postErrorStatus: 500,
      newAchievements: [],
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.success).toBe(true);
    expect(b.imageId).toBe("img2");
    expect(b.fediverseError).toBe("connect timeout");
    expect(b.fediverseErrorStatus).toBe(500);
  });

  it("publish が例外を投げたら 500", async () => {
    mockPublish.mockRejectedValue(new Error("db down"));
    const res = await POST(makeReq());
    expect(res.status).toBe(500);
    expect((await body(res)).error).toBe("投稿に失敗しました");
  });
});

describe("POST /api/v1/post: 位置情報（GPS→逆ジオコーディング）", () => {
  it("GPS座標つきなら reverseGeocode の結果を extras に載せて publish する", async () => {
    mockGeocode.mockResolvedValue({ prefecture: "東京都", city: "渋谷区" });
    const res = await POST(
      makeReq({ locationOption: "city", gpsLatitude: "35.66", gpsLongitude: "139.7" })
    );
    expect(res.status).toBe(200);
    expect(mockGeocode).toHaveBeenCalledWith(35.66, 139.7);
    const extras = mockPublish.mock.calls[0][0].extras;
    expect(extras?.locationPrefecture).toBe("東京都");
    expect(extras?.locationCity).toBe("渋谷区");
  });
});
