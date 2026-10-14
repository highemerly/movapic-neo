import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/compute/internalAuth", () => ({ verifyComputeApiKey: vi.fn(() => true) }));
// 実物は sharp/skia を読むので差し替える（CI はネイティブモジュール無しで回す）
vi.mock("@/lib/imageProcessor", () => ({ processImage: vi.fn() }));

import { POST } from "./route";
import { processImage } from "@/lib/imageProcessor";
import { ImageProcessError } from "@/lib/errors";
import { RENDER_STAGE_ERROR_STATUS, parseRenderStageError } from "@/lib/errors/renderStageError";

const mockProcess = vi.mocked(processImage);

function makeRequest(): NextRequest {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array([0xff, 0xd8])]), "image");
  form.append("text", "テスト");
  form.append("output", "mastodon");
  form.append("position", "top");
  form.append("color", "white");
  form.append("size", "medium");
  form.append("font", "hui-font");
  form.append("arrangement", "none");
  return new NextRequest("http://compute/api/internal/render", { method: "POST", body: form });
}

beforeEach(() => {
  mockProcess.mockReset();
});

describe("POST /api/internal/render: エラーの受け渡し", () => {
  it("ImageProcessError は stage と文言を取り決めのステータスで返す（worker-front で復元できる形）", async () => {
    mockProcess.mockRejectedValue(new ImageProcessError("画像の画素数が大きすぎます", "rotate", "rid"));
    const res = await POST(makeRequest());
    expect(res.status).toBe(RENDER_STAGE_ERROR_STATUS);
    expect(parseRenderStageError(await res.text())).toEqual({
      stage: "rotate",
      message: "画像の画素数が大きすぎます",
    });
  });

  it("想定外の例外は汎用の 500（内部の詳細は返さない）", async () => {
    mockProcess.mockRejectedValue(new Error("boom"));
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "render failed" });
  });
});
