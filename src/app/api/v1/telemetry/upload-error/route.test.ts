import { describe, it, expect, vi, afterEach } from "vitest";
import { POST } from "./route";

function req(body: unknown, opts?: { raw?: string }): Request {
  return new Request("http://localhost/api/v1/telemetry/upload-error", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "test-ua" },
    body: opts?.raw ?? JSON.stringify(body),
  });
}

describe("POST /api/v1/telemetry/upload-error", () => {
  afterEach(() => vi.restoreAllMocks());

  it("正常なJSONを受けると ok:true を返し、UAを付けてログに出す", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req({ endpoint: "generate", phase: "network" }) as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    // UA はサーバー側で付与される（クライアントからは送らせない）
    const logged = warn.mock.calls[0]?.[1] as string;
    expect(logged).toContain("test-ua");
    expect(logged).toContain("network");
  });

  it("JSONでない本文は 400 を返す", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req(null, { raw: "not-json" }) as never);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false });
  });

  it("オブジェクトでない本文（配列/プリミティブ以外）は 400 を返す", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req(42) as never);
    expect(res.status).toBe(400);
  });
});
