import { describe, it, expect } from "vitest";
import {
  LOGIN_REDIRECT_DEFAULT,
  parseReturnTo,
  sanitizeRedirectUrl,
} from "./redirectUrl";

// 拒否すべき入力。sanitizeRedirectUrl（既定へ差し戻す）と parseReturnTo（undefined にする）で
// 同じ集合を弾くことを両方で確認する＝規則が1本であることの担保。
const UNSAFE = [
  "http://evil.com",
  "https://evil.com",
  "//evil.com",
  "javascript:alert(1)",
  "mailto:a@b.com",
  "data:text/html,x",
  "settings", // スラッシュ始まりでない（相対パス）
  "/foo\\bar", // バックスラッシュ
  "/../etc/passwd",
  "/foo/../../bar",
  "/foo\x00bar", // null byte
  "/foo\nbar", // 制御文字
  "/foo\tbar",
];

describe("sanitizeRedirectUrl（オープンリダイレクト防止）", () => {
  it("安全な相対パスはそのまま（前後空白はトリム）", () => {
    expect(sanitizeRedirectUrl("/create")).toBe("/create");
    expect(sanitizeRedirectUrl("/u/alice?tab=posts#top")).toBe("/u/alice?tab=posts#top");
    expect(sanitizeRedirectUrl("  /foo  ")).toBe("/foo");
  });

  // 既定センチネルは OAuth state に載って往復するので、ここを素通りしないと別の値になり
  // resolveLoginRedirect が「戻り先の明示指定」と誤認する
  it("既定センチネルはそのまま通す", () => {
    expect(sanitizeRedirectUrl(LOGIN_REDIRECT_DEFAULT)).toBe(LOGIN_REDIRECT_DEFAULT);
  });

  it("null/undefined/空は既定パスへ", () => {
    expect(sanitizeRedirectUrl(null)).toBe(LOGIN_REDIRECT_DEFAULT);
    expect(sanitizeRedirectUrl(undefined)).toBe(LOGIN_REDIRECT_DEFAULT);
    expect(sanitizeRedirectUrl("")).toBe(LOGIN_REDIRECT_DEFAULT);
    expect(sanitizeRedirectUrl("   ")).toBe(LOGIN_REDIRECT_DEFAULT);
  });

  it("外部URL・プロトコル相対・相対パス・パストラバーサル・制御文字を拒否", () => {
    for (const bad of UNSAFE) {
      expect(sanitizeRedirectUrl(bad)).toBe(LOGIN_REDIRECT_DEFAULT);
    }
  });

  it("既定パスは差し替え可能", () => {
    expect(sanitizeRedirectUrl(null, "/")).toBe("/");
    expect(sanitizeRedirectUrl("http://x", "/login")).toBe("/login");
  });
});

describe("parseReturnTo（明示指定の読み取り）", () => {
  it("安全な相対パスはそのまま（前後空白はトリム）", () => {
    expect(parseReturnTo("/create")).toBe("/create");
    expect(parseReturnTo("  /favorite  ")).toBe("/favorite");
    expect(parseReturnTo("/create?restore=1")).toBe("/create?restore=1");
  });

  it("未指定は undefined（既定パスへ差し戻さない）", () => {
    expect(parseReturnTo(null)).toBeUndefined();
    expect(parseReturnTo(undefined)).toBeUndefined();
    expect(parseReturnTo("")).toBeUndefined();
    expect(parseReturnTo("   ")).toBeUndefined();
  });

  // 「ゴミが入っていたら指定なし扱い」。既定パスを返すと呼び出し側が
  // 「戻り先が指定されている」と誤認して案内バナーを出してしまう。
  it("安全でない値は undefined（sanitizeRedirectUrl と同じ集合を弾く）", () => {
    for (const bad of UNSAFE) {
      expect(parseReturnTo(bad)).toBeUndefined();
    }
  });

  // かつて LoginSection.tsx にあった手書きコピーは制御文字を素通ししていた。
  it("制御文字入りを弾く（手書きコピーが見落としていたケースの回帰防止）", () => {
    expect(parseReturnTo("/foo\nbar")).toBeUndefined();
    expect(parseReturnTo("/foo\rbar")).toBeUndefined();
    expect(parseReturnTo("/foo\x00bar")).toBeUndefined();
  });

  it("sanitizeRedirectUrl は parseReturnTo の結果に既定を足したものと一致する", () => {
    for (const input of ["/create", "  /foo  ", "", null, ...UNSAFE]) {
      expect(sanitizeRedirectUrl(input)).toBe(parseReturnTo(input) ?? LOGIN_REDIRECT_DEFAULT);
    }
  });
});
