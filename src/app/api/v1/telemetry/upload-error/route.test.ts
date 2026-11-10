import { describe, it, expect, vi, afterEach } from "vitest";
import { POST } from "./route";

// sendBeacon と同じく Content-Length を付ける（Request は自動では付けない）
function req(
  body: unknown,
  opts?: { raw?: string; contentLength?: string | null }
): Request {
  const text = opts?.raw ?? JSON.stringify(body);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "test-ua",
  };
  const length =
    opts?.contentLength === undefined ? String(Buffer.byteLength(text)) : opts.contentLength;
  if (length !== null) headers["content-length"] = length;
  return new Request("http://localhost/api/v1/telemetry/upload-error", {
    method: "POST",
    headers,
    body: text,
  });
}

const valid = {
  endpoint: "generate",
  phase: "network",
  uploadCompleted: false,
  uploadPct: 0,
  fileSize: 12345,
  output: "none",
  elapsedMs: 120,
  retryCount: 1,
  connection: { effectiveType: "4g", rtt: 50 },
};

const logged = (warn: ReturnType<typeof vi.spyOn>) =>
  JSON.parse(warn.mock.calls[0]?.[1] as string) as Record<string, unknown>;

describe("POST /api/v1/telemetry/upload-error", () => {
  afterEach(() => vi.restoreAllMocks());

  it("正常な報告を受けると ok:true を返し、UAを付けてログに出す", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req(valid) as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    // UA はサーバー側で付与される（クライアントからは送らせない）
    expect(logged(warn)).toMatchObject({
      endpoint: "generate",
      phase: "network",
      fileSize: 12345,
      connection: { effectiveType: "4g", rtt: 50 },
      ua: "test-ua",
    });
  });

  it("知らない項目はログに出さず、文字列は長さを切り詰める", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(
      req({ ...valid, injected: "x", fileType: "a".repeat(500), ua: "spoofed" }) as never
    );
    expect(res.status).toBe(200);
    const entry = logged(warn);
    expect(entry).not.toHaveProperty("injected");
    expect(entry.fileType).toBe("a".repeat(64));
    expect(entry.ua).toBe("test-ua");
  });

  it("型の違う値は落とす（数値の欄に文字列など）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await POST(req({ ...valid, fileSize: "huge", uploadCompleted: "yes" }) as never);
    const entry = logged(warn);
    expect(entry.fileSize).toBeUndefined();
    expect(entry.uploadCompleted).toBeUndefined();
  });

  it("本文が上限を超える申告なら読まずに 413 を返す", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req({ ...valid, pad: "x".repeat(5000) }) as never);
    expect(res.status).toBe(413);
    expect(warn).not.toHaveBeenCalled();
  });

  it("Content-Length が無くても、上限以内なら受け付ける（経路で chunked に変わる場合）", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req(valid, { contentLength: null }) as never);
    expect(res.status).toBe(200);
  });

  it("Content-Length が無いまま上限を超えて流れてきたら、途中で読むのをやめて 413 を返す", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(
      req({ ...valid, pad: "x".repeat(5000) }, { contentLength: null }) as never
    );
    expect(res.status).toBe(413);
    expect(warn).not.toHaveBeenCalled();
  });

  it("endpoint・phase が既知の値でなければ 400 を返す", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await POST(req({ ...valid, phase: "other" }) as never)).status).toBe(400);
    expect((await POST(req({ ...valid, endpoint: "admin" }) as never)).status).toBe(400);
  });

  it("JSONでない本文は 400 を返す", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req(null, { raw: "not-json" }) as never);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false });
  });

  it("オブジェクトでない本文（数値・配列）は 400 を返す", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await POST(req(42) as never)).status).toBe(400);
    expect((await POST(req([valid]) as never)).status).toBe(400);
  });
});
