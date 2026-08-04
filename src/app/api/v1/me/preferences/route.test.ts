import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 境界（認証・DB）をモックする。値のバリデーション（@/types）は純粋なので本物を通す。
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ default: { user: { update: vi.fn() } } }));

import { POST, DELETE } from "./route";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";

const mockAuth = vi.mocked(getCurrentUser);
const mockUpdate = vi.mocked(prisma.user.update);

type SessionUser = Awaited<ReturnType<typeof getCurrentUser>>;
const ME = { id: "u1", username: "alice", instance: { domain: "handon.club" } } as unknown as SessionUser;

/** POST が prisma へ渡した data。 */
function savedData(): Record<string, unknown> {
  return (mockUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
}

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/me/preferences", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID = {
  position: "top",
  font: "hui-font",
  color: "white",
  size: "medium",
  output: "mastodon",
  arrangement: "none",
  visibility: "public",
  cameraOption: "none",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(ME);
  mockUpdate.mockResolvedValue({} as never);
});

describe("POST /api/v1/me/preferences", () => {
  it("未認証なら401を返し、保存しない", async () => {
    mockAuth.mockResolvedValue(null as unknown as SessionUser);

    const res = await POST(req(VALID));

    expect(res.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["位置", { position: "diagonal" }],
    ["フォント", { font: "comic-sans" }],
    ["色", { color: "chartreuse" }],
    ["サイズ", { size: "gigantic" }],
    ["出力形式", { output: "bluesky" }],
    ["アレンジ", { arrangement: "zigzag" }],
    ["公開範囲", { visibility: "direct" }],
    ["カメラ機種設定", { cameraOption: "everything" }],
  ])("%sが不正なら400を返し、保存しない", async (_label, patch) => {
    const res = await POST(req({ ...VALID, ...patch }));

    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("全項目が妥当なら保存する", async () => {
    const res = await POST(req(VALID));

    expect(res.status).toBe(200);
    expect(savedData()).toEqual({
      defaultPosition: "top",
      defaultFont: "hui-font",
      defaultColor: "white",
      defaultSize: "medium",
      defaultOutput: "mastodon",
      defaultArrangement: "none",
      defaultVisibility: "public",
      defaultCameraOption: "none",
    });
  });

  it("保存した内容をそのまま返す", async () => {
    const res = await POST(req(VALID));

    await expect(res.json()).resolves.toEqual({
      success: true,
      preferences: {
        position: "top",
        font: "hui-font",
        color: "white",
        size: "medium",
        output: "mastodon",
        arrangement: "none",
        visibility: "public",
        cameraOption: "none",
      },
    });
  });

  it("部分更新ではなく全置換（送らなかった項目は null で潰れる）", async () => {
    const res = await POST(req({ position: "bottom" }));

    expect(res.status).toBe(200);
    expect(savedData()).toEqual({
      defaultPosition: "bottom",
      defaultFont: null,
      defaultColor: null,
      defaultSize: null,
      defaultOutput: null,
      defaultArrangement: null,
      defaultVisibility: null,
      defaultCameraOption: null,
    });
  });

  it("空文字は未設定（null）として保存する", async () => {
    await POST(req({ ...VALID, position: "" }));

    expect(savedData().defaultPosition).toBeNull();
  });

  it("DBが落ちたら500を返す", async () => {
    mockUpdate.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req(VALID));

    expect(res.status).toBe(500);
    errorSpy.mockRestore();
  });

  it("壊れたJSONは500になる（json() を catch していないため）", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req("{壊れている"));

    expect(res.status).toBe(500);
    errorSpy.mockRestore();
  });
});

describe("DELETE /api/v1/me/preferences", () => {
  it("未認証なら401を返し、リセットしない", async () => {
    mockAuth.mockResolvedValue(null as unknown as SessionUser);

    const res = await DELETE();

    expect(res.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("全項目を null に戻す", async () => {
    const res = await DELETE();

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: {
        defaultPosition: null,
        defaultFont: null,
        defaultColor: null,
        defaultSize: null,
        defaultOutput: null,
        defaultArrangement: null,
        defaultVisibility: null,
        defaultCameraOption: null,
      },
    });
  });

  it("DBが落ちたら500を返す", async () => {
    mockUpdate.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await DELETE();

    expect(res.status).toBe(500);
    errorSpy.mockRestore();
  });
});
