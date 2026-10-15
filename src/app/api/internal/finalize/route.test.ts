import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/compute/internalAuth", () => ({ verifyComputeApiKey: vi.fn(() => true) }));
// 実物はネイティブモジュールを読むので差し替える（CI は sharp 無しで回す）
const meta = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("sharp", () => ({ default: vi.fn(() => ({ metadata: async () => meta.current })) }));
vi.mock("@/lib/thumbnail", () => ({ generateThumbnail: vi.fn(async () => Buffer.from("thumb")) }));
vi.mock("@/lib/blurData", () => ({ computeBlurDataUrl: vi.fn(async () => null) }));

import { POST } from "./route";
import { generateThumbnail } from "@/lib/thumbnail";

function makeRequest(): NextRequest {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array([0xff, 0xd8])]), "image");
  form.append("position", "top");
  return new NextRequest("http://compute/api/internal/finalize", { method: "POST", body: form });
}

beforeEach(() => {
  vi.mocked(generateThumbnail).mockClear();
});

describe("POST /api/internal/finalize: 寸法チェック", () => {
  it("文字入れの出力サイズ（長辺2048）なら寸法と形式を返す", async () => {
    meta.current = { format: "avif", width: 2048, height: 1536 };
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Detected-Mime")).toBe("image/avif");
    expect(res.headers.get("X-Width")).toBe("2048");
  });

  it("長辺が2048を超える画像はサムネ生成（全画素の展開）前に400で弾く", async () => {
    meta.current = { format: "heif", compression: "av1", width: 16_000, height: 16_000 };
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    expect(generateThumbnail).not.toHaveBeenCalled();
  });
});
