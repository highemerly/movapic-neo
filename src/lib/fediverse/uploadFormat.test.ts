/**
 * アップロード形式の解決（resolveUploadFormat）のテスト。
 *
 * SHAMEZO の保存物は例外なく AVIF・Mastodon だけが AVIF を受け取れない、という
 * 非対称をここ1箇所で表現している。Misskey まで JPEG 化したり、旧 JPEG 投稿の
 * 再投稿を無駄に変換したりしないことを固定する。
 */

import { describe, it, expect } from "vitest";
import { resolveUploadFormat } from "@/lib/fediverse/uploadFormat";

describe("resolveUploadFormat", () => {
  it("Mastodon × AVIF は JPEG へ変換し、Content-Type と拡張子も差し替える", () => {
    expect(
      resolveUploadFormat({
        instanceType: "mastodon",
        contentType: "image/avif",
        filename: "movapic-abc.avif",
      })
    ).toEqual({
      contentType: "image/jpeg",
      filename: "movapic-abc.jpg",
      transcodeTo: "jpeg",
    });
  });

  it("Misskey × AVIF は変換しない（無変換で保存されるため AVIF の利点が残る）", () => {
    expect(
      resolveUploadFormat({
        instanceType: "misskey",
        contentType: "image/avif",
        filename: "movapic-abc.avif",
      })
    ).toEqual({
      contentType: "image/avif",
      filename: "movapic-abc.avif",
      transcodeTo: null,
    });
  });

  it("Mastodon × JPEG は変換しない（AVIF 化以前に保存された画像の再投稿）", () => {
    expect(
      resolveUploadFormat({
        instanceType: "mastodon",
        contentType: "image/jpeg",
        filename: "movapic-abc.jpg",
      })
    ).toEqual({
      contentType: "image/jpeg",
      filename: "movapic-abc.jpg",
      transcodeTo: null,
    });
  });

  it("未知のインスタンス種別は変換しない", () => {
    expect(
      resolveUploadFormat({
        instanceType: "pleroma",
        contentType: "image/avif",
        filename: "movapic-abc.avif",
      }).transcodeTo
    ).toBeNull();
  });

  it("拡張子が無いファイル名には拡張子を付ける", () => {
    expect(
      resolveUploadFormat({
        instanceType: "mastodon",
        contentType: "image/avif",
        filename: "movapic",
      }).filename
    ).toBe("movapic.jpg");
  });

  it("ドットを含むファイル名でも最後の拡張子だけを差し替える", () => {
    expect(
      resolveUploadFormat({
        instanceType: "mastodon",
        contentType: "image/avif",
        filename: "movapic.2026.07.avif",
      }).filename
    ).toBe("movapic.2026.07.jpg");
  });
});
