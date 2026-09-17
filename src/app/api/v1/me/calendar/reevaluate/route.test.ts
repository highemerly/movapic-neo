/**
 * POST /api/v1/me/calendar/reevaluate のテスト。
 *
 * 判定と付与の本体は engine.evaluateAndGrantPerfectMonth（grantAll を通るので実績ptも付く）。
 * ここではルートの責務（認証・入力検証・月の組み立て・レスポンス形）だけを固定する。
 * 以前はルート内で achievement.create を直接叩いており、皆勤賞経由の実績ptが漏れていた。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/session", () => ({ getCurrentUserWithValidation: vi.fn() }));
vi.mock("@/lib/achievements/engine", () => ({ evaluateAndGrantPerfectMonth: vi.fn() }));

import { POST } from "./route";
import { getCurrentUserWithValidation } from "@/lib/auth/session";
import { evaluateAndGrantPerfectMonth } from "@/lib/achievements/engine";

const mockAuth = vi.mocked(getCurrentUserWithValidation);
const mockEvaluate = vi.mocked(evaluateAndGrantPerfectMonth);

type SessionUser = Awaited<ReturnType<typeof getCurrentUserWithValidation>>;
const OWNER = { id: "u1", instance: { domain: "handon.club" } } as unknown as SessionUser;

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/me/calendar/reevaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(OWNER);
  mockEvaluate.mockResolvedValue({ perfect: false, granted: false, key: "perfect-month:2026-10" });
});

describe("POST /api/v1/me/calendar/reevaluate", () => {
  it("未認証なら401を返し、判定しない", async () => {
    mockAuth.mockResolvedValue(null as unknown as SessionUser);

    const res = await POST(req({ year: 2026, month: 10 }));

    expect(res.status).toBe(401);
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it.each([
    ["年が無い", { month: 10 }],
    ["月が0", { year: 2026, month: 0 }],
    ["月が13", { year: 2026, month: 13 }],
    ["整数でない", { year: 2026, month: 1.5 }],
  ])("年月が不正なら400を返す（%s）", async (_label, body) => {
    const res = await POST(req(body));

    expect(res.status).toBe(400);
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it("本人の所属ドメインと0埋めした年月で判定する", async () => {
    await POST(req({ year: 2026, month: 9 }));

    expect(mockEvaluate).toHaveBeenCalledWith({
      userId: "u1",
      instanceDomain: "handon.club",
      ym: "2026-09",
    });
  });

  it("新たに付与したら granted=true と実績キーを返す", async () => {
    mockEvaluate.mockResolvedValue({ perfect: true, granted: true, key: "perfect-month:2026-10" });

    const res = await POST(req({ year: 2026, month: 10 }));

    await expect(res.json()).resolves.toEqual({ success: true, granted: true, key: "perfect-month:2026-10" });
  });

  it("既に付与済み・非達成なら granted=false", async () => {
    mockEvaluate.mockResolvedValue({ perfect: true, granted: false, key: "perfect-month:2026-10" });

    const res = await POST(req({ year: 2026, month: 10 }));

    await expect(res.json()).resolves.toEqual({ success: true, granted: false });
  });

  it("判定が失敗したら500を返す", async () => {
    mockEvaluate.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req({ year: 2026, month: 10 }));

    expect(res.status).toBe(500);
    errorSpy.mockRestore();
  });
});
