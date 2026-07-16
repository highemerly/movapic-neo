import { describe, it, expect } from "vitest";
import {
  formatExifDetails,
  sanitizeExifDetails,
  hasAnyExifDetail,
} from "./details";

describe("formatExifDetails", () => {
  it("代表的なタグを表示済み文字列に整形する", () => {
    const d = formatExifDetails({
      FNumber: 2.8,
      ExposureTime: 1 / 250,
      ISO: 400,
      FocalLength: 50,
      FocalLengthIn35mmFormat: 75,
      LensModel: "EF50mm f/1.8 STM",
      ExposureBiasValue: 0.7,
      Flash: 0,
    });
    expect(d.fNumber).toBe("f/2.8");
    expect(d.exposureTime).toBe("1/250");
    expect(d.iso).toBe("ISO 400");
    expect(d.focalLength).toBe("50mm");
    expect(d.focalLength35).toBe("35mm換算 75mm");
    expect(d.lens).toBe("EF50mm f/1.8 STM");
    expect(d.exposureBias).toBe("+0.7 EV");
    expect(d.flash).toBe("非発光");
  });

  it("1秒以上のシャッター速度は「◯秒」表記にする", () => {
    expect(formatExifDetails({ ExposureTime: 1.3 }).exposureTime).toBe("1.3秒");
    expect(formatExifDetails({ ExposureTime: 3 }).exposureTime).toBe("3秒");
  });

  it("露出補正0は「±0 EV」、負値は符号付きにする", () => {
    expect(formatExifDetails({ ExposureBiasValue: 0 }).exposureBias).toBe("±0 EV");
    expect(formatExifDetails({ ExposureBiasValue: -1 }).exposureBias).toBe("-1 EV");
  });

  it("フラッシュは数値ビットフィールドの最下位ビットで発光判定する", () => {
    expect(formatExifDetails({ Flash: 1 }).flash).toBe("発光");
    expect(formatExifDetails({ Flash: 0x19 }).flash).toBe("発光"); // 発光+自動
    expect(formatExifDetails({ Flash: 16 }).flash).toBe("非発光"); // 発光せず
  });

  it("フラッシュが文言でも発光有無を推定する", () => {
    expect(formatExifDetails({ Flash: "Fired" }).flash).toBe("発光");
    expect(formatExifDetails({ Flash: "No flash" }).flash).toBe("非発光");
  });

  it("LensModel が無ければ LensMake を使う", () => {
    expect(formatExifDetails({ LensMake: "Canon" }).lens).toBe("Canon");
  });

  it("欠損・不正値の項目は結果に含めない", () => {
    const d = formatExifDetails({
      FNumber: NaN,
      ExposureTime: 0,
      ISO: -1,
      FocalLength: 0,
    });
    expect(d.fNumber).toBeUndefined();
    expect(d.exposureTime).toBeUndefined();
    expect(d.iso).toBeUndefined();
    expect(d.focalLength).toBeUndefined();
    expect(hasAnyExifDetail(d)).toBe(false);
  });
});

describe("sanitizeExifDetails", () => {
  it("既知キーの文字列のみを受け付け、余分なキーは除去する", () => {
    const out = sanitizeExifDetails({
      fNumber: "f/2.8",
      iso: "ISO 400",
      // 未知キー・非文字列は無視される
      evil: "x",
      exposureTime: 12345,
    });
    expect(out).toEqual({ fNumber: "f/2.8", iso: "ISO 400" });
  });

  it("文字数上限（100字）で切り詰める", () => {
    const long = "あ".repeat(200);
    const out = sanitizeExifDetails({ lens: long });
    expect(out?.lens?.length).toBe(100);
  });

  it("オブジェクトでない・空・全項目無効なら null を返す", () => {
    expect(sanitizeExifDetails(null)).toBeNull();
    expect(sanitizeExifDetails("x")).toBeNull();
    expect(sanitizeExifDetails({})).toBeNull();
    expect(sanitizeExifDetails({ fNumber: "  " })).toBeNull();
  });
});
