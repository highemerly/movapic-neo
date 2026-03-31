import { describe, it, expect, vi } from "vitest";

// mailparser をモック（ネイティブ依存なし）
vi.mock("mailparser", () => ({
  simpleParser: vi.fn(),
}));

import { parseEmail } from "./parser";
import { simpleParser } from "mailparser";

const mockSimpleParser = vi.mocked(simpleParser);

function makeMailMock(overrides: Record<string, unknown> = {}) {
  return {
    from: { value: [{ address: "test@example.com" }] },
    to: { value: [{ address: "bot@example.com" }] },
    subject: "",
    text: "テストテキスト",
    html: null,
    attachments: [],
    ...overrides,
  };
}

describe("parseEmail - 件名オプション解析", () => {
  it("空の件名はデフォルトオプションを返す", async () => {
    mockSimpleParser.mockResolvedValueOnce(makeMailMock({ subject: "" }) as never);
    const result = await parseEmail(Buffer.from(""));
    expect(result.options).toEqual({
      position: "top",
      font: "hui-font",
      color: "white",
      size: "medium",
      arrangement: "none",
    });
  });

  it("位置キーワードを解析する", async () => {
    for (const [jp, en] of [["上", "top"], ["下", "bottom"], ["左", "left"], ["右", "right"]]) {
      mockSimpleParser.mockResolvedValueOnce(makeMailMock({ subject: jp }) as never);
      const result = await parseEmail(Buffer.from(""));
      expect(result.options.position).toBe(en);
    }
  });

  it("カラーキーワードを解析する", async () => {
    const cases: [string, string][] = [
      ["白", "white"], ["赤", "red"], ["青", "blue"], ["緑", "green"],
      ["黄", "yellow"], ["茶", "brown"], ["桃", "pink"], ["橙", "orange"],
    ];
    for (const [jp, en] of cases) {
      mockSimpleParser.mockResolvedValueOnce(makeMailMock({ subject: jp }) as never);
      const result = await parseEmail(Buffer.from(""));
      expect(result.options.color).toBe(en);
    }
  });

  it("サイズキーワードを解析する", async () => {
    for (const [jp, en] of [["小", "small"], ["中", "medium"], ["大", "large"], ["特大", "extra-large"]]) {
      mockSimpleParser.mockResolvedValueOnce(makeMailMock({ subject: jp }) as never);
      const result = await parseEmail(Buffer.from(""));
      expect(result.options.size).toBe(en);
    }
  });

  it("フォントキーワードを解析する", async () => {
    for (const [jp, en] of [["ふい字", "hui-font"], ["ゴシック", "noto-sans-jp"], ["ラノベ", "light-novel-pop"]]) {
      mockSimpleParser.mockResolvedValueOnce(makeMailMock({ subject: jp }) as never);
      const result = await parseEmail(Buffer.from(""));
      expect(result.options.font).toBe(en);
    }
  });

  it("アレンジキーワードを解析する", async () => {
    for (const [jp, en] of [["ネオン", "neon"], ["ハンコ", "stamp"]]) {
      mockSimpleParser.mockResolvedValueOnce(makeMailMock({ subject: jp }) as never);
      const result = await parseEmail(Buffer.from(""));
      expect(result.options.arrangement).toBe(en);
    }
  });

  it("複数キーワードをスペース区切りで解析する", async () => {
    mockSimpleParser.mockResolvedValueOnce(makeMailMock({ subject: "上 赤 大 ゴシック ネオン" }) as never);
    const result = await parseEmail(Buffer.from(""));
    expect(result.options).toEqual({
      position: "top",
      font: "noto-sans-jp",
      color: "red",
      size: "large",
      arrangement: "neon",
    });
  });

  it("不明なトークンは無視する", async () => {
    mockSimpleParser.mockResolvedValueOnce(makeMailMock({ subject: "上 unknown xyz" }) as never);
    const result = await parseEmail(Buffer.from(""));
    expect(result.options.position).toBe("top");
    expect(result.options.color).toBe("white"); // デフォルトのまま
  });
});

describe("parseEmail - 本文テキスト抽出", () => {
  it("テキスト本文をそのまま返す", async () => {
    mockSimpleParser.mockResolvedValueOnce(makeMailMock({ text: "こんにちは" }) as never);
    const result = await parseEmail(Buffer.from(""));
    expect(result.text).toBe("こんにちは");
  });

  it("140文字を超えるテキストは切り捨てる", async () => {
    const longText = "あ".repeat(200);
    mockSimpleParser.mockResolvedValueOnce(makeMailMock({ text: longText }) as never);
    const result = await parseEmail(Buffer.from(""));
    expect(result.text.length).toBe(140);
  });

  it("ちょうど140文字はそのまま返す", async () => {
    const text = "い".repeat(140);
    mockSimpleParser.mockResolvedValueOnce(makeMailMock({ text }) as never);
    const result = await parseEmail(Buffer.from(""));
    expect(result.text.length).toBe(140);
  });

  it("HTMLメールのタグを除去してテキストを返す", async () => {
    mockSimpleParser.mockResolvedValueOnce(makeMailMock({
      text: null,
      html: "<p>こんにちは</p><p>世界</p>",
    }) as never);
    const result = await parseEmail(Buffer.from(""));
    expect(result.text).toContain("こんにちは");
    expect(result.text).toContain("世界");
  });

  it("HTMLエンティティをデコードする", async () => {
    mockSimpleParser.mockResolvedValueOnce(makeMailMock({
      text: null,
      html: "<p>&lt;テスト&gt; &amp; &quot;引用&quot;</p>",
    }) as never);
    const result = await parseEmail(Buffer.from(""));
    expect(result.text).toContain("<テスト>");
    expect(result.text).toContain("&");
    expect(result.text).toContain("\"引用\"");
  });
});

describe("parseEmail - 添付画像", () => {
  it("画像添付ファイルを抽出する", async () => {
    const imageBuffer = Buffer.from("fake-image-data");
    mockSimpleParser.mockResolvedValueOnce(makeMailMock({
      attachments: [{
        contentType: "image/jpeg",
        filename: "photo.jpg",
        content: imageBuffer,
      }],
    }) as never);
    const result = await parseEmail(Buffer.from(""));
    expect(result.image).not.toBeNull();
    expect(result.image?.contentType).toBe("image/jpeg");
    expect(result.image?.filename).toBe("photo.jpg");
  });

  it("画像なしの場合は null を返す", async () => {
    mockSimpleParser.mockResolvedValueOnce(makeMailMock({ attachments: [] }) as never);
    const result = await parseEmail(Buffer.from(""));
    expect(result.image).toBeNull();
  });

  it("非画像の添付ファイルは無視する", async () => {
    mockSimpleParser.mockResolvedValueOnce(makeMailMock({
      attachments: [{
        contentType: "application/pdf",
        filename: "doc.pdf",
        content: Buffer.from("pdf-data"),
      }],
    }) as never);
    const result = await parseEmail(Buffer.from(""));
    expect(result.image).toBeNull();
  });

  it("HEIC画像を受け入れる", async () => {
    mockSimpleParser.mockResolvedValueOnce(makeMailMock({
      attachments: [{
        contentType: "image/heic",
        filename: "photo.heic",
        content: Buffer.from("heic-data"),
      }],
    }) as never);
    const result = await parseEmail(Buffer.from(""));
    expect(result.image?.contentType).toBe("image/heic");
  });
});

describe("parseEmail - from/to アドレス", () => {
  it("送信者・受信者アドレスを返す", async () => {
    mockSimpleParser.mockResolvedValueOnce(makeMailMock({
      from: { value: [{ address: "sender@example.com" }] },
      to: { value: [{ address: "receiver@example.com" }] },
    }) as never);
    const result = await parseEmail(Buffer.from(""));
    expect(result.from).toBe("sender@example.com");
    expect(result.to).toBe("receiver@example.com");
  });
});
