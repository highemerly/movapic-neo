import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// 唯一の境界＝compute への委譲をモック（sharp/skia を読ませない）。
vi.mock("@/lib/compute/client", () => ({ renderImage: vi.fn() }));

import { POST } from "./route";
import { renderImage } from "@/lib/compute/client";
import { ErrorCodes, ImageProcessError } from "@/lib/errors";
import { MAX_FILE_SIZE, MAX_TEXT_LENGTH } from "@/types";

const mockRender = vi.mocked(renderImage);

let ipCounter = 0;
// レート制限は POST の最初に IP 単位で記録されるので、各テストは一意な IP を使う
// （同一 IP を意図的に使うのはレート制限テストのみ）。
const uniqueIp = () => `k-${++ipCounter}`;

const validImage = () => new File([new Uint8Array([1, 2, 3, 4])], "test.png", { type: "image/png" });

function makeReq(
  overrides: Record<string, unknown> = {},
  ip?: string
): NextRequest {
  const fields: Record<string, unknown> = {
    image: validImage(),
    text: "こんにちは",
    position: "top",
    font: "hui-font",
    color: "white",
    size: "medium",
    output: "mastodon",
    arrangement: "none",
    ...overrides,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined) continue;
    fd.set(k, v as string | Blob);
  }
  return new NextRequest("http://localhost/api/v1/generate", {
    method: "POST",
    body: fd,
    headers: { "x-forwarded-for": ip ?? uniqueIp() },
  });
}

const okResult = () => ({
  buffer: Buffer.from("IMAGEDATA"),
  contentType: "image/avif",
  extension: "avif",
  originalWidth: 800,
  originalHeight: 600,
});

beforeEach(() => {
  // withTimeout の setTimeout(22s) を実時間で走らせない（テストのハングと未処理タイマーを防ぐ）。
  vi.useFakeTimers();
  mockRender.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

async function errorBody(res: Response): Promise<{ success: boolean; error: { code: string } }> {
  return res.json();
}

describe("POST /api/v1/generate: 成功", () => {
  it("有効なパラメータで画像バイナリと各ヘッダーを返す", async () => {
    mockRender.mockResolvedValue(okResult());
    const res = await POST(makeReq());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/avif");
    expect(res.headers.get("Content-Length")).toBe(String(Buffer.from("IMAGEDATA").length));
    expect(res.headers.get("Content-Disposition")).toContain("generated.avif");
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
    expect(res.headers.get("X-Original-Width")).toBe("800");

    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.toString()).toBe("IMAGEDATA");
    expect(mockRender).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/v1/generate: バリデーション（統一エラー形 {success:false,error:{code}}）", () => {
  const cases: { name: string; overrides: Record<string, unknown>; status: number; code: string }[] = [
    { name: "画像なし", overrides: { image: null }, status: 400, code: ErrorCodes.VALIDATION_REQUIRED },
    { name: "非対応の拡張子/型", overrides: { image: new File(["x"], "a.txt", { type: "text/plain" }) }, status: 400, code: ErrorCodes.VALIDATION_FILE_TYPE },
    { name: "テキストなし", overrides: { text: "   " }, status: 400, code: ErrorCodes.VALIDATION_REQUIRED },
    { name: "テキスト長すぎ", overrides: { text: "あ".repeat(MAX_TEXT_LENGTH + 1) }, status: 400, code: ErrorCodes.VALIDATION_TOO_LONG },
    { name: "出力形式が不正", overrides: { output: "twitter" }, status: 400, code: ErrorCodes.VALIDATION_INVALID },
    { name: "位置が不正", overrides: { position: "center" }, status: 400, code: ErrorCodes.VALIDATION_INVALID },
    { name: "フォントが不正", overrides: { font: "arial" }, status: 400, code: ErrorCodes.VALIDATION_INVALID },
    { name: "色が不正", overrides: { color: "purple" }, status: 400, code: ErrorCodes.VALIDATION_INVALID },
    { name: "期間外シーズン", overrides: { season: "nonexistent-season" }, status: 400, code: ErrorCodes.VALIDATION_INVALID },
  ];

  it.each(cases)("$name → $status", async ({ overrides, status, code }) => {
    const res = await POST(makeReq(overrides));
    expect(res.status).toBe(status);
    const body = await errorBody(res);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe(code);
    expect(mockRender).not.toHaveBeenCalled();
  });

  it("ファイルサイズ超過は VALIDATION_FILE_TOO_LARGE", async () => {
    const big = new File([new Uint8Array(MAX_FILE_SIZE + 1)], "big.png", { type: "image/png" });
    const res = await POST(makeReq({ image: big }));
    expect(res.status).toBe(400);
    expect((await errorBody(res)).error.code).toBe(ErrorCodes.VALIDATION_FILE_TOO_LARGE);
  });
});

describe("POST /api/v1/generate: レート制限", () => {
  it("同一IPは10秒あたり2回まで許可し、3回目が429（Retry-Afterヘッダー付き）", async () => {
    mockRender.mockResolvedValue(okResult());
    const ip = "rate-limit-ip";

    expect((await POST(makeReq({}, ip))).status).toBe(200);
    expect((await POST(makeReq({}, ip))).status).toBe(200);

    const third = await POST(makeReq({}, ip));
    expect(third.status).toBe(429);
    expect(third.headers.get("Retry-After")).toBeTruthy();
    expect((await errorBody(third)).error.code).toBe(ErrorCodes.RATE_LIMIT);
  });
});

describe("POST /api/v1/generate: 画像処理エラーのマッピング", () => {
  it("compute が ImageProcessError(タイムアウト) → 504", async () => {
    mockRender.mockRejectedValue(new ImageProcessError("タイムアウト", "overlay", "rid"));
    const res = await POST(makeReq());
    expect(res.status).toBe(504);
    expect((await errorBody(res)).error.code).toBe(ErrorCodes.TIMEOUT_OVERLAY);
  });

  it("compute が ImageProcessError(処理失敗) → 500 IMAGE_PROCESS_FAILED", async () => {
    mockRender.mockRejectedValue(new ImageProcessError("画像の読み込みに失敗しました", "overlay", "rid"));
    const res = await POST(makeReq());
    expect(res.status).toBe(500);
    expect((await errorBody(res)).error.code).toBe(ErrorCodes.IMAGE_PROCESS_FAILED);
  });

  it("想定外の例外 → 500 INTERNAL_ERROR", async () => {
    mockRender.mockRejectedValue(new Error("boom"));
    const res = await POST(makeReq());
    expect(res.status).toBe(500);
    expect((await errorBody(res)).error.code).toBe(ErrorCodes.INTERNAL_ERROR);
  });

  it("処理が22秒を超えると withTimeout が発火して 504（実タイムアウト配線）", async () => {
    mockRender.mockImplementation(() => new Promise(() => {})); // 永遠に解決しない
    const p = POST(makeReq());
    await vi.advanceTimersByTimeAsync(22000);
    const res = await p;
    expect(res.status).toBe(504);
    expect((await errorBody(res)).error.code).toBe(ErrorCodes.TIMEOUT_PROCESSING);
  });
});
