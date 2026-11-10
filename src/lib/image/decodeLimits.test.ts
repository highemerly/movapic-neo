import { describe, it, expect } from "vitest";
import {
  MAX_DECODE_PIXELS,
  MAX_DECODE_PIXELS_HEAVY,
  maxDecodePixels,
  exceedsDecodePixelLimit,
  isSupportedInputFormat,
  MAX_OUTPUT_EDGE,
  exceedsOutputEdge,
  estimateDecodeMB,
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

describe("exceedsOutputEdge", () => {
  it("長辺が出力上限ちょうどなら通す（縦長・横長とも）", () => {
    expect(exceedsOutputEdge({ width: MAX_OUTPUT_EDGE, height: 1536 })).toBe(false);
    expect(exceedsOutputEdge({ width: 1536, height: MAX_OUTPUT_EDGE })).toBe(false);
  });

  it("長辺が出力上限を超えたら弾く（文字入れ処理では作られない画像）", () => {
    expect(exceedsOutputEdge({ width: MAX_OUTPUT_EDGE + 1, height: 100 })).toBe(true);
    expect(exceedsOutputEdge({ width: 100, height: 16_000 })).toBe(true);
  });
});

describe("estimateDecodeMB", () => {
  it("画素数と形式で見積もる（同じ寸法なら HEIF > WebP > JPEG > PNG）", () => {
    const size = { width: 8000, height: 6000 };
    const heif = estimateDecodeMB({ format: "heif", ...size });
    const webp = estimateDecodeMB({ format: "webp", ...size });
    const jpeg = estimateDecodeMB({ format: "jpeg", ...size });
    const png = estimateDecodeMB({ format: "png", ...size });
    expect(heif).toBeGreaterThan(webp);
    expect(webp).toBeGreaterThan(jpeg);
    expect(jpeg).toBeGreaterThan(png);
  });

  it("実測（2026-11-10）の増分を下回らない", () => {
    // 1枚と同時複数枚のピークの差から求めた増分（decodeLimits のコメント参照）
    expect(estimateDecodeMB({ format: "heif", width: 8900, height: 8900 })).toBeGreaterThanOrEqual(907);
    expect(estimateDecodeMB({ format: "heif", width: 8064, height: 6048 })).toBeGreaterThanOrEqual(566);
    expect(estimateDecodeMB({ format: "heif", width: 4032, height: 3024 })).toBeGreaterThanOrEqual(172);
    expect(estimateDecodeMB({ format: "jpeg", width: 4032, height: 3024 })).toBeGreaterThanOrEqual(172);
    expect(estimateDecodeMB({ format: "webp", width: 8900, height: 8900 })).toBeGreaterThanOrEqual(544);
    expect(estimateDecodeMB({ format: "jpeg", width: 14000, height: 13500 })).toBeGreaterThanOrEqual(500);
    expect(estimateDecodeMB({ format: "png", width: 14000, height: 13500 })).toBeGreaterThanOrEqual(128);
  });

  it("rotate がヘッダで弾く入力（対応外の形式・画素数超過）は展開しないので 0", () => {
    expect(estimateDecodeMB({ format: "gif", width: 14000, height: 14000 })).toBe(0);
    expect(estimateDecodeMB({ format: "heif", width: 14000, height: 14000 })).toBe(0);
  });

  it("ヘッダが読めない・寸法が無いときは jpeg-js の上限ぶんで見積もる", () => {
    expect(estimateDecodeMB(undefined)).toBeGreaterThanOrEqual(512);
    expect(estimateDecodeMB({ format: "jpeg" })).toBeGreaterThanOrEqual(512);
  });
});
