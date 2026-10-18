import { describe, it, expect } from "vitest";
import { buildContentSecurityPolicy, generateCspNonce } from "./csp";

const base = {
  nonce: "abc123",
  isDev: false,
  mediaProxyOrigin: "https://proxy.example",
  storagePublicOrigin: "https://media.example",
};

function directive(csp: string, name: string): string | undefined {
  return csp.split("; ").find((d) => d.startsWith(`${name} `));
}

describe("buildContentSecurityPolicy", () => {
  it("script-src はインラインを nonce でだけ許可し、'unsafe-inline' を含まない", () => {
    const scriptSrc = directive(buildContentSecurityPolicy(base), "script-src");
    expect(scriptSrc).toBe("script-src 'self' 'nonce-abc123'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("'strict-dynamic' は付けない（'self' が無視され Service Worker 等が通らなくなるため）", () => {
    expect(buildContentSecurityPolicy(base)).not.toContain("'strict-dynamic'");
  });

  it("dev のときだけ 'unsafe-eval' を足す（React のデバッグ用）", () => {
    expect(directive(buildContentSecurityPolicy(base), "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(buildContentSecurityPolicy({ ...base, isDev: true }), "script-src")).toBe(
      "script-src 'self' 'nonce-abc123' 'unsafe-eval'"
    );
  });

  it("img-src にメディアプロキシと投稿画像のオリジンを入れ、未設定なら詰める", () => {
    expect(directive(buildContentSecurityPolicy(base), "img-src")).toBe(
      "img-src 'self' data: blob: https://proxy.example https://media.example"
    );
    expect(
      directive(
        buildContentSecurityPolicy({ ...base, mediaProxyOrigin: "", storagePublicOrigin: "" }),
        "img-src"
      )
    ).toBe("img-src 'self' data: blob:");
  });

  it("埋め込み・プラグイン・base/form の制限は従来どおり", () => {
    const csp = buildContentSecurityPolicy(base);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });
});

describe("generateCspNonce", () => {
  it("リクエストごとに異なる値を返す", () => {
    expect(generateCspNonce()).not.toBe(generateCspNonce());
  });
});
