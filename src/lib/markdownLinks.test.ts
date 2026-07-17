import { describe, it, expect } from "vitest";
import { classifyHref } from "./markdownLinks";

describe("classifyHref", () => {
  it("http(s) の絶対URLは external", () => {
    expect(classifyHref("https://example.com")).toBe("external");
    expect(classifyHref("http://example.com/path")).toBe("external");
    expect(classifyHref("HTTPS://EXAMPLE.COM")).toBe("external");
  });

  it("'/' 始まりの内部パスは internal", () => {
    expect(classifyHref("/dashboard")).toBe("internal");
    expect(classifyHref("/u/alice@example.com")).toBe("internal");
  });

  it("javascript: 等の危険スキームは unsafe（リンク化しない）", () => {
    expect(classifyHref("javascript:alert(1)")).toBe("unsafe");
    expect(classifyHref("data:text/html,<script>alert(1)</script>")).toBe("unsafe");
    expect(classifyHref("vbscript:msgbox(1)")).toBe("unsafe");
    expect(classifyHref("mailto:a@example.com")).toBe("unsafe");
  });

  it("protocol-relative '//' と '/\\' は open redirect になるため unsafe", () => {
    expect(classifyHref("//evil.example.com")).toBe("unsafe");
    expect(classifyHref("/\\evil.example.com")).toBe("unsafe");
  });

  it("スキーム相対・相対パスは unsafe（内部/外部いずれの安全条件も満たさない）", () => {
    expect(classifyHref("foo/bar")).toBe("unsafe");
    expect(classifyHref("ftp://example.com")).toBe("unsafe");
  });
});
