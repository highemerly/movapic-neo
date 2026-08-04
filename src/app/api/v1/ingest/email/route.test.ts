import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash, createHmac } from "crypto";

// 境界（DB / S3 / キュー / メールパース）をモックする。
// 署名検証（@/lib/auth/crypto）は認証境界そのものなのでモックせず本物を通す。
vi.mock("@/lib/db", () => ({ default: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/storage/storage", () => ({ uploadImage: vi.fn() }));
vi.mock("@/lib/queue", () => ({ enqueueEmail: vi.fn() }));
vi.mock("@/lib/email/parser", () => ({ parseEmail: vi.fn() }));

import { POST } from "./route";
import { parseEmail } from "@/lib/email/parser";
import { uploadImage } from "@/lib/storage/storage";
import { enqueueEmail } from "@/lib/queue";
import prisma from "@/lib/db";
import { MAX_TEXT_LENGTH, MAX_FILE_SIZE } from "@/types";

const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockParseEmail = vi.mocked(parseEmail);
const mockUpload = vi.mocked(uploadImage);
const mockEnqueue = vi.mocked(enqueueEmail);

const API_KEY = "test-internal-key";
const RAW_EMAIL = Buffer.from("From: a@example.com\r\n\r\nbody");

/** route が使う署名方式（crypto.ts の generateRequestSignature 相当。非公開なので再現する）。 */
function sign(timestamp: number, body: Buffer, secret = API_KEY): string {
  const bodyHash = createHash("sha256").update(body).digest("hex");
  return createHmac("sha256", secret).update(`${timestamp}:${bodyHash}`).digest("hex");
}

function bodyHashOf(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

function req(
  opts: {
    body?: Buffer;
    apiKey?: string | null;
    timestamp?: string | null;
    signature?: string | null;
    emailPrefix?: string | null;
  } = {}
): NextRequest {
  const body = opts.body ?? RAW_EMAIL;
  const ts = opts.timestamp === undefined ? String(Date.now()) : opts.timestamp;
  const headers = new Headers();
  const apiKey = opts.apiKey === undefined ? API_KEY : opts.apiKey;
  if (apiKey !== null) headers.set("X-API-Key", apiKey);
  if (ts !== null) headers.set("X-Request-Timestamp", ts);
  const sig =
    opts.signature === undefined ? sign(Number(ts) || 0, body) : opts.signature;
  if (sig !== null) headers.set("X-Request-Signature", sig);
  const prefix = opts.emailPrefix === undefined ? "alice" : opts.emailPrefix;
  if (prefix !== null) headers.set("X-Email-Prefix", prefix);

  return new NextRequest("http://localhost/api/v1/ingest/email", {
    method: "POST",
    headers,
    body: new Uint8Array(body),
  });
}

const USER = {
  id: "u1",
  emailPrefix: "alice",
  defaultPosition: "top",
  defaultFont: "hui-font",
  defaultColor: "white",
  defaultSize: "medium",
  defaultArrangement: "normal",
  defaultVisibility: "public",
  defaultCameraOption: "none",
  instance: { domain: "handon.club", type: "mastodon" },
};

const DEFAULT_OPTIONS = {
  position: "top",
  font: "hui-font",
  color: "white",
  size: "medium",
  arrangement: "normal",
  season: null as string | null,
  seasonRequested: false,
  visibility: "public",
  cameraOption: "none",
  locationOption: "none",
};

function parsed(over: Record<string, unknown> = {}) {
  return {
    from: "a@example.com",
    to: "alice@shamezo.example",
    text: "こんにちは",
    options: { ...DEFAULT_OPTIONS },
    image: {
      buffer: Buffer.from([1, 2, 3, 4]),
      filename: "photo.jpg",
      contentType: "image/jpeg",
    },
    ...over,
  } as never;
}

async function errorOf(res: Response): Promise<{ code: string; message: string; suggestion?: string }> {
  const json = (await res.json()) as { success: boolean; error: { code: string; message: string; suggestion?: string } };
  expect(json.success).toBe(false);
  return json.error;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INTERNAL_API_KEY", API_KEY);
  mockUserFindUnique.mockResolvedValue(USER as never);
  mockParseEmail.mockResolvedValue(parsed());
  mockUpload.mockResolvedValue(undefined as never);
  mockEnqueue.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/v1/ingest/email — 認証", () => {
  it("INTERNAL_API_KEY が未設定なら、正しい鍵を送っても401で拒否する", async () => {
    vi.stubEnv("INTERNAL_API_KEY", "");

    const res = await POST(req());

    expect(res.status).toBe(401);
    expect(mockParseEmail).not.toHaveBeenCalled();
  });

  it("APIキーが違えば401", async () => {
    const res = await POST(req({ apiKey: "wrong-key" }));

    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("AUTH_INVALID");
  });

  it("APIキーが無ければ401", async () => {
    const res = await POST(req({ apiKey: null }));

    expect(res.status).toBe(401);
  });

  it("タイムスタンプが無ければ401", async () => {
    const res = await POST(req({ timestamp: null, signature: "x" }));

    expect(res.status).toBe(401);
    expect((await errorOf(res)).message).toBe("署名が不足しています");
  });

  it("署名が無ければ401", async () => {
    const res = await POST(req({ signature: null }));

    expect(res.status).toBe(401);
    expect((await errorOf(res)).message).toBe("署名が不足しています");
  });

  it("タイムスタンプが数値でなければ401", async () => {
    const res = await POST(req({ timestamp: "not-a-number", signature: "x" }));

    expect(res.status).toBe(401);
    expect((await errorOf(res)).message).toBe("無効なタイムスタンプです");
  });

  it("署名が一致しなければ401", async () => {
    const res = await POST(req({ signature: "a".repeat(64) }));

    expect(res.status).toBe(401);
    expect((await errorOf(res)).message).toBe("署名の検証に失敗しました");
  });

  it("別の鍵で署名されていれば401", async () => {
    const ts = Date.now();
    const res = await POST(req({ timestamp: String(ts), signature: sign(ts, RAW_EMAIL, "other-secret") }));

    expect(res.status).toBe(401);
  });

  it("古いタイムスタンプの署名は401（リプレイ防止）", async () => {
    const stale = Date.now() - 6 * 60 * 1000;
    const res = await POST(req({ timestamp: String(stale), signature: sign(stale, RAW_EMAIL) }));

    expect(res.status).toBe(401);
  });

  it("ボディが署名時と違えば401（改竄検知）", async () => {
    const ts = Date.now();
    const res = await POST(
      req({
        body: Buffer.from("tampered"),
        timestamp: String(ts),
        signature: sign(ts, RAW_EMAIL),
      })
    );

    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/ingest/email — 宛先とバリデーション", () => {
  it("メールプレフィックスが無ければ400", async () => {
    const res = await POST(req({ emailPrefix: null }));

    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("VALIDATION_REQUIRED");
  });

  it("該当ユーザーが居なければ404", async () => {
    mockUserFindUnique.mockResolvedValue(null as never);

    const res = await POST(req());

    expect(res.status).toBe(404);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("ユーザーのWeb初期設定をパースの既定値として渡す", async () => {
    await POST(req());

    expect(mockParseEmail).toHaveBeenCalledWith(expect.anything(), {
      position: "top",
      font: "hui-font",
      color: "white",
      size: "medium",
      arrangement: "normal",
      visibility: "public",
      cameraOption: "none",
    });
  });

  it("画像が添付されていなければ400", async () => {
    mockParseEmail.mockResolvedValue(parsed({ image: null }));

    const res = await POST(req());

    expect(res.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("テキストが空なら400", async () => {
    mockParseEmail.mockResolvedValue(parsed({ text: "" }));

    const res = await POST(req());

    expect(res.status).toBe(400);
  });

  it("テキストが空白だけなら400", async () => {
    mockParseEmail.mockResolvedValue(parsed({ text: "   \n  " }));

    const res = await POST(req());

    expect(res.status).toBe(400);
  });

  it(`テキストが${MAX_TEXT_LENGTH}文字を超えたら400`, async () => {
    mockParseEmail.mockResolvedValue(parsed({ text: "あ".repeat(MAX_TEXT_LENGTH + 1) }));

    const res = await POST(req());

    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("VALIDATION_TOO_LONG");
  });

  it(`ちょうど${MAX_TEXT_LENGTH}文字は受け付ける`, async () => {
    mockParseEmail.mockResolvedValue(parsed({ text: "あ".repeat(MAX_TEXT_LENGTH) }));

    const res = await POST(req());

    expect(res.status).toBe(202);
  });

  it("シーズン指定があるのに有効なシーズンが無ければ400", async () => {
    mockParseEmail.mockResolvedValue(
      parsed({ options: { ...DEFAULT_OPTIONS, seasonRequested: true, season: null } })
    );

    const res = await POST(req());

    expect(res.status).toBe(400);
    expect((await errorOf(res)).message).toBe("現在利用できるシーズンがありません");
  });

  it("画像が大きすぎたら400（対処方法つき）", async () => {
    mockParseEmail.mockResolvedValue(
      parsed({
        image: {
          buffer: Buffer.alloc(MAX_FILE_SIZE + 1),
          filename: "big.jpg",
          contentType: "image/jpeg",
        },
      })
    );

    const res = await POST(req());

    expect(res.status).toBe(400);
    const err = await errorOf(res);
    expect(err.code).toBe("VALIDATION_FILE_TOO_LARGE");
    expect(err.suggestion).toContain("MB以下");
  });

  it("対応していない画像形式は400", async () => {
    mockParseEmail.mockResolvedValue(
      parsed({
        image: { buffer: Buffer.from([1]), filename: "a.bmp", contentType: "image/bmp" },
      })
    );

    const res = await POST(req());

    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("VALIDATION_FILE_TYPE");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it.each(["image/heic", "image/heif", "IMAGE/HEIC"])(
    "HEIC/HEIF は受け付ける（%s）",
    async (contentType) => {
      mockParseEmail.mockResolvedValue(
        parsed({
          image: { buffer: Buffer.from([1]), filename: "a.heic", contentType },
        })
      );

      const res = await POST(req());

      expect(res.status).toBe(202);
    }
  );
});

describe("POST /api/v1/ingest/email — 受付", () => {
  it("原本を tmp/email/ 配下へ保存する", async () => {
    await POST(req());

    expect(mockUpload).toHaveBeenCalledTimes(1);
    const [buffer, key, contentType] = mockUpload.mock.calls[0];
    expect(buffer).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(key).toMatch(/^tmp\/email\/[0-9a-f-]{36}\.jpeg$/);
    expect(contentType).toBe("image/jpeg");
  });

  it("ジョブを積んで202を返す（この時点では投稿しない）", async () => {
    const res = await POST(req());

    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual({ success: true, queued: true });

    const [payload, dedupKey] = mockEnqueue.mock.calls[0];
    expect(payload.userId).toBe("u1");
    expect(payload.text).toBe("こんにちは");
    expect(payload.sourceContentType).toBe("image/jpeg");
    expect(payload.sourceStorageKey).toMatch(/^tmp\/email\//);
    // dedup キーは raw email のハッシュ＝同一メールの再転送を潰す。
    expect(dedupKey).toBe(bodyHashOf(RAW_EMAIL));
  });

  it("S3保存に失敗したらジョブを積まない", async () => {
    mockUpload.mockRejectedValue(new Error("s3 down"));

    const res = await POST(req());

    expect(res.status).toBe(500);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("パースが失敗したら500（未知エラーとして処理される）", async () => {
    mockParseEmail.mockRejectedValue(new Error("broken mime"));

    const res = await POST(req());

    expect(res.status).toBe(500);
  });
});
