import { describe, it, expect } from "vitest";
import {
  normalizeVisibility,
  toMastodonVisibility,
  toMisskeyVisibility,
} from "./visibility";

describe("normalizeVisibility", () => {
  it("local / unlisted はそのまま", () => {
    expect(normalizeVisibility("local")).toBe("local");
    expect(normalizeVisibility("unlisted")).toBe("unlisted");
  });

  it("public はそのまま", () => {
    expect(normalizeVisibility("public")).toBe("public");
  });

  it("未知値・null・undefined・空文字は public にフォールバック", () => {
    expect(normalizeVisibility("followers")).toBe("public");
    expect(normalizeVisibility("direct")).toBe("public");
    expect(normalizeVisibility("")).toBe("public");
    expect(normalizeVisibility(null)).toBe("public");
    expect(normalizeVisibility(undefined)).toBe("public");
  });
});

describe("toMastodonVisibility", () => {
  it("unlisted はそのまま、それ以外（public/local）は public", () => {
    expect(toMastodonVisibility("unlisted")).toBe("unlisted");
    expect(toMastodonVisibility("public")).toBe("public");
    expect(toMastodonVisibility("local")).toBe("public");
  });
});

describe("toMisskeyVisibility", () => {
  it("unlisted は home（非収載相当）、それ以外は public", () => {
    expect(toMisskeyVisibility("unlisted")).toBe("home");
    expect(toMisskeyVisibility("public")).toBe("public");
    expect(toMisskeyVisibility("local")).toBe("public");
  });
});
