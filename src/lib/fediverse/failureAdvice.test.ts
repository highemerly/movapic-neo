import { describe, it, expect } from "vitest";
import { failureAdvice } from "./failureAdvice";

const S = { retry: "RETRY", relogin: "RELOGIN" };
const DOMAIN = "example.social";

describe("failureAdvice", () => {
  it("status なし（タイムアウト・接続失敗）は障害扱いで retry を案内する", () => {
    const a = failureAdvice(DOMAIN, undefined, S);
    expect(a.explanation).toContain("過負荷");
    expect(a.suggestion).toBe("RETRY");
    expect(a.authFailure).toBe(false);
  });

  it("5xx は障害扱いで retry を案内する", () => {
    expect(failureAdvice(DOMAIN, 503, S).suggestion).toBe("RETRY");
    expect(failureAdvice(DOMAIN, 503, S).authFailure).toBe(false);
  });

  it("429 は混雑扱いで retry を案内する", () => {
    const a = failureAdvice(DOMAIN, 429, S);
    expect(a.explanation).toContain("集中");
    expect(a.suggestion).toBe("RETRY");
  });

  it("401/403 は連携失効扱いで relogin を案内し authFailure=true", () => {
    for (const code of [401, 403]) {
      const a = failureAdvice(DOMAIN, code, S);
      expect(a.explanation).toContain("権限");
      expect(a.suggestion).toBe("RELOGIN");
      expect(a.authFailure).toBe(true);
    }
  });

  it("404/410 は投稿先なし扱いで relogin を案内する（authFailure ではない）", () => {
    for (const code of [404, 410]) {
      const a = failureAdvice(DOMAIN, code, S);
      expect(a.suggestion).toBe("RELOGIN");
      expect(a.authFailure).toBe(false);
    }
  });

  it("422 は内容不受理扱いで retry を案内する", () => {
    expect(failureAdvice(DOMAIN, 422, S).explanation).toContain("受け付けません");
  });

  it("その他の 4xx は汎用文言で retry を案内する", () => {
    const a = failureAdvice(DOMAIN, 418, S);
    expect(a.suggestion).toBe("RETRY");
    expect(a.authFailure).toBe(false);
  });
});
