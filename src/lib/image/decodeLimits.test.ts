import { describe, it, expect } from "vitest";
import {
  MAX_DECODE_PIXELS,
  MAX_DECODE_PIXELS_HEAVY,
  maxDecodePixels,
  exceedsDecodePixelLimit,
  isSupportedInputFormat,
} from "./decodeLimits";

describe("isSupportedInputFormat", () => {
  it("JPEG・PNG・WebP・HEIF（HEIC/AVIF）は受け付ける", () => {
    for (const f of ["jpeg", "png", "webp", "heif"]) {
      expect(isSupportedInputFormat(f)).toBe(true);
    }
  });

  it("libvips が読めても対応外の形式は弾く（申告 MIME を偽って届くため）", () => {
    for (const f of ["gif", "svg", "tiff", "jp2k", "ppm", "rad", "raw"]) {
      expect(isSupportedInputFormat(f)).toBe(false);
    }
  });

  it("形式が判定できないときは弾く", () => {
    expect(isSupportedInputFormat(undefined)).toBe(false);
  });
});

describe("maxDecodePixels", () => {
  it("HEIF（HEIC/AVIF）と WebP は重い形式の上限", () => {
    expect(maxDecodePixels("heif")).toBe(MAX_DECODE_PIXELS_HEAVY);
    expect(maxDecodePixels("webp")).toBe(MAX_DECODE_PIXELS_HEAVY);
  });

  it("JPEG / PNG / 不明な形式は通常の上限", () => {
    expect(maxDecodePixels("jpeg")).toBe(MAX_DECODE_PIXELS);
    expect(maxDecodePixels("png")).toBe(MAX_DECODE_PIXELS);
    expect(maxDecodePixels(undefined)).toBe(MAX_DECODE_PIXELS);
  });
});

describe("exceedsDecodePixelLimit", () => {
  it("iPhone の 48MP HEIC は通る", () => {
    expect(exceedsDecodePixelLimit({ format: "heif", width: 8064, height: 6048 })).toBe(false);
  });

  it("上限ちょうどは通り、1画素でも超えたら弾く", () => {
    expect(exceedsDecodePixelLimit({ format: "heif", width: 10_000, height: 8_000 })).toBe(false);
    expect(exceedsDecodePixelLimit({ format: "heif", width: 10_001, height: 8_000 })).toBe(true);
  });

  it("同じ寸法でも JPEG は通し、AVIF・WebP は弾く（形式でメモリが桁違いのため）", () => {
    const size = { width: 14_000, height: 14_000 };
    expect(exceedsDecodePixelLimit({ format: "jpeg", ...size })).toBe(false);
    expect(exceedsDecodePixelLimit({ format: "heif", ...size })).toBe(true);
    expect(exceedsDecodePixelLimit({ format: "webp", ...size })).toBe(true);
  });

  it("JPEG も 200MP を超えたら弾く", () => {
    expect(exceedsDecodePixelLimit({ format: "jpeg", width: 16_000, height: 16_000 })).toBe(true);
  });

  it("寸法が取れないときは弾かない（判定不能は sharp 側の上限に任せる）", () => {
    expect(exceedsDecodePixelLimit({ format: "heif" })).toBe(false);
  });
});
