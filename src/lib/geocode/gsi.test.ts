import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import muniCodes from "./muni-codes.json";
import { reverseGeocode } from "./gsi";

// 実在する muniCd を1つ拝借（値をハードコードせず JSON から導く）
const KNOWN_CODE = Object.keys(muniCodes)[0];
const KNOWN_ENTRY = (muniCodes as Record<string, { prefecture: string; city: string }>)[KNOWN_CODE];

/** fetch のレスポンスもどきを作る */
const resp = (init: { ok?: boolean; body?: unknown }) => ({
  ok: init.ok ?? true,
  json: async () => init.body ?? {},
});

let mockFetch: Mock;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reverseGeocode", () => {
  it("非有限な座標は fetch せず null", async () => {
    expect(await reverseGeocode(NaN, 139)).toBeNull();
    expect(await reverseGeocode(35, Infinity)).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("座標を小数第3位に丸めて問い合わせる（プライバシー保護）＋UA付与", async () => {
    mockFetch.mockResolvedValue(resp({ body: { results: { muniCd: KNOWN_CODE } } }));
    await reverseGeocode(35.123456, 139.987654);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("lat=35.123");
    expect(url).toContain("lon=139.988");
    expect(options.headers["User-Agent"]).toBeTruthy();
  });

  it("既知の muniCd は都道府県＋市区町村を返す", async () => {
    mockFetch.mockResolvedValue(resp({ body: { results: { muniCd: KNOWN_CODE } } }));
    expect(await reverseGeocode(35, 139)).toEqual(KNOWN_ENTRY);
  });

  it("HTTPエラー（!ok）は null", async () => {
    mockFetch.mockResolvedValue(resp({ ok: false }));
    expect(await reverseGeocode(35, 139)).toBeNull();
  });

  it("muniCd が無い（海外・無人地域）は null", async () => {
    mockFetch.mockResolvedValue(resp({ body: { results: {} } }));
    expect(await reverseGeocode(0, 0)).toBeNull();
  });

  it("未知の muniCd は null", async () => {
    mockFetch.mockResolvedValue(resp({ body: { results: { muniCd: "99999" } } }));
    expect(await reverseGeocode(35, 139)).toBeNull();
  });

  it("fetch 例外（タイムアウト等）は null", async () => {
    mockFetch.mockRejectedValue(new Error("aborted"));
    expect(await reverseGeocode(35, 139)).toBeNull();
  });
});
