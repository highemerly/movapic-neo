import { describe, it, expect } from "vitest";
import { parseApiError, formatErrorMessage } from "./client";

const jsonRes = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), init);

describe("parseApiError: 新形式 {success:false,error:{...}}", () => {
  it("message/suggestion/supportInfo(status+code+requestId) を組み立てる", async () => {
    const res = jsonRes(
      { success: false, error: { code: "VALIDATION_INVALID", message: "だめ", suggestion: "直して", requestId: "req-1" } },
      { status: 400 }
    );
    const parsed = await parseApiError(res);
    expect(parsed.message).toBe("だめ");
    expect(parsed.suggestion).toBe("直して");
    expect(parsed.supportInfo).toBe("Error code: 400 VALIDATION_INVALID req-1");
  });

  it("requestId が無ければ supportInfo に含めない", async () => {
    const res = jsonRes(
      { success: false, error: { code: "NOT_FOUND", message: "無い" } },
      { status: 404 }
    );
    expect((await parseApiError(res)).supportInfo).toBe("Error code: 404 NOT_FOUND");
  });

  it("Retry-After(数値)を秒数として取り込む", async () => {
    const res = jsonRes(
      { success: false, error: { code: "RATE_LIMIT", message: "多すぎ" } },
      { status: 429, headers: { "Retry-After": "8" } }
    );
    expect((await parseApiError(res)).retryAfterSeconds).toBe(8);
  });

  it("Retry-After が非数値/無しなら undefined", async () => {
    const bad = jsonRes(
      { success: false, error: { code: "RATE_LIMIT", message: "多すぎ" } },
      { status: 429, headers: { "Retry-After": "Wed, 21 Oct" } }
    );
    expect((await parseApiError(bad)).retryAfterSeconds).toBeUndefined();

    const none = jsonRes({ success: false, error: { code: "X", message: "y" } }, { status: 400 });
    expect((await parseApiError(none)).retryAfterSeconds).toBeUndefined();
  });
});

describe("parseApiError: 旧形式 {error:string}", () => {
  it("文字列 error をそのまま message にする", async () => {
    const res = jsonRes({ error: "認証が必要です" }, { status: 401 });
    const parsed = await parseApiError(res);
    expect(parsed.message).toBe("認証が必要です");
    expect(parsed.supportInfo).toBe("Error code: 401");
    expect(parsed.retryAfterSeconds).toBeUndefined();
  });
});

describe("parseApiError: 想定外JSON / パース失敗はステータスでフォールバック", () => {
  it("想定外の形（500）はサーバーエラー文言＋suggestion", async () => {
    const res = jsonRes({ foo: "bar" }, { status: 500 });
    const parsed = await parseApiError(res);
    expect(parsed.message).toBe("サーバーでエラーが発生しました");
    expect(parsed.suggestion).toContain("管理者へお問い合わせ");
    expect(parsed.supportInfo).toBe("Error code: 500");
  });

  it("JSONでないボディ（503）は混雑文言＋suggestion", async () => {
    const res = new Response("<html>Service Unavailable</html>", { status: 503 });
    const parsed = await parseApiError(res);
    expect(parsed.message).toBe("サーバーが混み合っています");
    expect(parsed.suggestion).toContain("しばらく待って");
  });

  it("その他ステータス（400）は汎用文言・suggestionなし", async () => {
    const res = new Response("boom", { status: 400 });
    const parsed = await parseApiError(res);
    expect(parsed.message).toBe("エラーが発生しました");
    expect(parsed.suggestion).toBeUndefined();
  });

  it("フォールバック時も Retry-After を取り込む", async () => {
    const res = new Response("nope", { status: 503, headers: { "Retry-After": "30" } });
    expect((await parseApiError(res)).retryAfterSeconds).toBe(30);
  });
});

describe("formatErrorMessage", () => {
  it("suggestion があれば括弧で連結", () => {
    expect(formatErrorMessage({ message: "失敗", suggestion: "再試行" })).toBe("失敗（再試行）");
  });
  it("suggestion が無ければ message のみ", () => {
    expect(formatErrorMessage({ message: "失敗" })).toBe("失敗");
  });
});
