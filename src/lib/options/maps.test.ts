import { describe, it, expect } from "vitest";
import {
  decodeHtmlEntities,
  POSITION_MAP,
  COLOR_MAP,
  SIZE_MAP,
  FONT_MAP,
  ARRANGEMENT_MAP,
  VISIBILITY_MAP,
} from "./maps";

describe("decodeHtmlEntities", () => {
  it("名前付きエンティティを復号する", () => {
    expect(decodeHtmlEntities("&lt;a&gt;")).toBe("<a>");
    expect(decodeHtmlEntities("Tom &amp; Jerry")).toBe("Tom & Jerry");
    expect(decodeHtmlEntities("a&nbsp;b")).toBe("a b");
    expect(decodeHtmlEntities("&quot;q&quot;")).toBe('"q"');
    expect(decodeHtmlEntities("&#39;/&apos;")).toBe("'/'");
    expect(decodeHtmlEntities("&hellip;&yen;")).toBe("…¥");
  });

  it("数値エンティティ（10進・16進）を復号する", () => {
    expect(decodeHtmlEntities("&#65;&#66;")).toBe("AB");
    expect(decodeHtmlEntities("&#12354;")).toBe("あ");
    expect(decodeHtmlEntities("&#x41;")).toBe("A");
    expect(decodeHtmlEntities("&#x3042;")).toBe("あ");
  });

  it("範囲外のコードポイントは除去する", () => {
    expect(decodeHtmlEntities("&#0;")).toBe("");
    expect(decodeHtmlEntities("&#1114112;")).toBe(""); // 0x110000（上限超）
    expect(decodeHtmlEntities("&#x110000;")).toBe("");
  });

  it("エンティティを含まない文字列はそのまま", () => {
    expect(decodeHtmlEntities("普通のテキスト")).toBe("普通のテキスト");
    expect(decodeHtmlEntities("")).toBe("");
  });
});

describe("キーワード→オプション値マップ（メール/メンション共通）", () => {
  it("位置・色・サイズ・フォント・アレンジ・公開範囲の代表対応", () => {
    expect(POSITION_MAP["上"]).toBe("top");
    expect(POSITION_MAP["右"]).toBe("right");
    expect(COLOR_MAP["赤"]).toBe("red");
    expect(COLOR_MAP["橙"]).toBe("orange");
    expect(SIZE_MAP["特大"]).toBe("extra-large");
    expect(FONT_MAP["ふい字"]).toBe("hui-font");
    expect(FONT_MAP["ゴシック"]).toBe("noto-sans-jp");
    expect(ARRANGEMENT_MAP["ネオン"]).toBe("neon");
    expect(ARRANGEMENT_MAP["ハンコ"]).toBe("stamp");
    expect(VISIBILITY_MAP["unlisted"]).toBe("unlisted");
    // local はコマンドで指定不可
    expect(VISIBILITY_MAP["local"]).toBeUndefined();
  });
});
