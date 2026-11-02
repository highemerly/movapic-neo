import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { parseEmail } from "./parser";

// 本物の mailparser に .eml を通す。parser.test.ts は mailparser をモックしているため、
// mailparser 自体の更新（Renovate）で日本語メールの解析が変わっても気づけない。こちらはそれを拾う。
// mailparser は純 JS なので CI（--ignore-scripts）でも動く。
//
// __fixtures__ の .eml は日本の携帯キャリア・iPhone・Gmail で見かける形を模して手で組んだもの
// （添付の中身は画像として有効である必要はなく、バイト列が欠けずに取り出せるかだけを見る）。
const FIXTURES = path.join(__dirname, "__fixtures__");
const load = (name: string) => readFileSync(path.join(FIXTURES, name));

// 各 .eml の添付画像に入れたバイト列（0..255 を 8 回）。
const IMAGE_BYTES = Buffer.from(Array.from({ length: 2048 }, (_, i) => i % 256));

// 4-gmail-html-only.eml の本文 `<div dir="ltr">ねこ &amp; いぬ&nbsp;&lt;3<br>二行目</div>` から
// parser.ts がタグを除いてエンティティを戻した結果（&nbsp; は半角スペースに戻す仕様）。
const HTML_ONLY_TEXT = "ねこ & いぬ <3\n二行目";

describe("parseEmail（本物の mailparser）", () => {
  it("ISO-2022-JP の件名・本文・差出人の日本語名（docomo 風）", async () => {
    const r = await parseEmail(load("1-docomo-iso2022jp.eml"));
    expect(r.from).toBe("taro@docomo.ne.jp");
    expect(r.to).toBe("abc123@pic.handon.club");
    expect(r.options).toMatchObject({ position: "top", color: "red", size: "large" });
    expect(r.text).toBe("今日のねこ\nかわいい");
    expect(r.image).toEqual({ buffer: IMAGE_BYTES, filename: "photo.jpg", contentType: "image/jpeg" });
  });

  it("Shift_JIS の本文（半角カナ含む）と、引用符内に RFC 2047 で書いた日本語ファイル名（au 風）", async () => {
    const r = await parseEmail(load("2-au-sjis.eml"));
    expect(r.from).toBe("hanako@ezweb.ne.jp");
    expect(r.options).toMatchObject({ position: "bottom", color: "blue", size: "small", font: "noto-sans-jp" });
    expect(r.text).toBe("おはよう、ﾊﾝｶｸもある");
    expect(r.image).toEqual({ buffer: IMAGE_BYTES, filename: "写真.jpg", contentType: "image/jpeg" });
  });

  it("UTF-8 quoted-printable（format=flowed）・RFC 2231 のファイル名・HEIC 添付・宛先複数（iPhone 風）", async () => {
    const r = await parseEmail(load("3-iphone-utf8-heic.eml"));
    expect(r.from).toBe("hanako@icloud.com");
    expect(r.to).toBe("abc123@pic.handon.club");
    expect(r.options).toMatchObject({ thread: true, position: "right", size: "extra-large" });
    expect(r.text).toBe("いただきます　🍣\nとても美味しかった");
    expect(r.image).toEqual({ buffer: IMAGE_BYTES, filename: "写真 1.heic", contentType: "image/heic" });
  });

  it("HTML だけの本文・Q エンコードの件名・分割された RFC 2231 のファイル名（Gmail 風）", async () => {
    const r = await parseEmail(load("4-gmail-html-only.eml"));
    expect(r.to).toBe("abc123@pic.handon.club");
    expect(r.options).toMatchObject({ size: "large", arrangement: "neon" });
    expect(r.text).toBe(HTML_ONLY_TEXT);
    expect(r.image).toEqual({
      buffer: IMAGE_BYTES,
      filename: "とても長い名前の写真ファイル_2026年11月02日.png",
      contentType: "image/png",
    });
  });

  it("長い日本語の quoted-printable（ソフト改行）を1行に戻す・添付なし", async () => {
    const r = await parseEmail(load("5-long-qp-noattach.eml"));
    const kana = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん";
    expect(r.text).toBe(kana + kana);
    expect(r.image).toBeNull();
  });

  it("件名・本文なし、PDF は飛ばして JPEG を拾う、表示名にカンマを含む差出人", async () => {
    const r = await parseEmail(load("6-noSubject-pdf-and-jpeg.eml"));
    expect(r.from).toBe("c@example.com");
    expect(r.text).toBe("");
    expect(r.options).toMatchObject({ position: "top", color: "white", size: "medium" });
    expect(r.image).toEqual({ buffer: IMAGE_BYTES, filename: "IMG_0001.JPG", contentType: "image/jpeg" });
  });
});
