import { describe, it, expect } from "vitest";
import { parseMentionContent, formatOptionsSummary } from "./parser";

const BOT_ACCT = "movapic";

describe("parseMentionContent - テキスト抽出", () => {
  it("シンプルなテキストを返す", () => {
    const result = parseMentionContent(
      `<p><span class="h-card">@${BOT_ACCT}</span> こんにちは</p>`,
      BOT_ACCT,
    );
    expect(result.text).toBe("こんにちは");
  });

  it("Botメンション（ドメインあり）を除去する", () => {
    const result = parseMentionContent(
      `<p>@${BOT_ACCT}@handon.club テスト</p>`,
      BOT_ACCT,
    );
    expect(result.text).toBe("テスト");
  });

  it("HTMLタグを除去する", () => {
    const result = parseMentionContent(
      `<p><span>@${BOT_ACCT}</span> <b>太字</b>テキスト</p>`,
      BOT_ACCT,
    );
    expect(result.text).toBe("太字テキスト");
  });

  it("<br>を改行に変換する", () => {
    const result = parseMentionContent(
      `<p>@${BOT_ACCT} 1行目<br>2行目</p>`,
      BOT_ACCT,
    );
    expect(result.text).toContain("\n");
  });

  it("コマンド部分 [...] をテキストから除去する", () => {
    const result = parseMentionContent(
      `<p>@${BOT_ACCT} [上 赤] テスト投稿</p>`,
      BOT_ACCT,
    );
    expect(result.text).toBe("テスト投稿");
  });

  it("HTMLエンティティをデコードする", () => {
    const result = parseMentionContent(
      `<p>@${BOT_ACCT} &lt;こんにちは&gt;</p>`,
      BOT_ACCT,
    );
    expect(result.text).toBe("<こんにちは>");
  });
});

describe("parseMentionContent - オプション解析", () => {
  it("コマンドなしはデフォルトオプションを返す", () => {
    const result = parseMentionContent(`<p>@${BOT_ACCT} テスト</p>`, BOT_ACCT);
    expect(result.options).toMatchObject({
      position: "top",
      font: "hui-font",
      color: "white",
      size: "medium",
      arrangement: "none",
      debug: false,
      keep: false,
    });
  });

  it("位置コマンドを解析する", () => {
    const cases: [string, string][] = [
      ["上", "top"], ["下", "bottom"], ["左", "left"], ["右", "right"],
    ];
    for (const [jp, en] of cases) {
      const result = parseMentionContent(`<p>@${BOT_ACCT} [${jp}] テスト</p>`, BOT_ACCT);
      expect(result.options.position).toBe(en);
    }
  });

  it("カラーコマンドを解析する", () => {
    const cases: [string, string][] = [
      ["白", "white"], ["赤", "red"], ["青", "blue"], ["緑", "green"],
      ["黄", "yellow"], ["茶", "brown"], ["桃", "pink"], ["橙", "orange"],
    ];
    for (const [jp, en] of cases) {
      const result = parseMentionContent(`<p>@${BOT_ACCT} [${jp}] テスト</p>`, BOT_ACCT);
      expect(result.options.color).toBe(en);
    }
  });

  it("サイズコマンドを解析する", () => {
    for (const [jp, en] of [["小", "small"], ["中", "medium"], ["大", "large"], ["特大", "extra-large"]]) {
      const result = parseMentionContent(`<p>@${BOT_ACCT} [${jp}] テスト</p>`, BOT_ACCT);
      expect(result.options.size).toBe(en);
    }
  });

  it("フォントコマンドを解析する", () => {
    for (const [jp, en] of [["ふい字", "hui-font"], ["ゴシック", "noto-sans-jp"], ["ラノベ", "light-novel-pop"]]) {
      const result = parseMentionContent(`<p>@${BOT_ACCT} [${jp}] テスト</p>`, BOT_ACCT);
      expect(result.options.font).toBe(en);
    }
  });

  it("アレンジコマンドを解析する", () => {
    for (const [jp, en] of [["ネオン", "neon"], ["ハンコ", "stamp"]]) {
      const result = parseMentionContent(`<p>@${BOT_ACCT} [${jp}] テスト</p>`, BOT_ACCT);
      expect(result.options.arrangement).toBe(en);
    }
  });

  it("debug フラグを解析する", () => {
    const result = parseMentionContent(`<p>@${BOT_ACCT} [debug] テスト</p>`, BOT_ACCT);
    expect(result.options.debug).toBe(true);
  });

  it("keep フラグを解析する", () => {
    const result = parseMentionContent(`<p>@${BOT_ACCT} [keep] テスト</p>`, BOT_ACCT);
    expect(result.options.keep).toBe(true);
  });

  it("visibility コマンドを解析する", () => {
    const resultPublic = parseMentionContent(`<p>@${BOT_ACCT} [public] テスト</p>`, BOT_ACCT);
    expect(resultPublic.options.visibility).toBe("public");

    const resultUnlisted = parseMentionContent(`<p>@${BOT_ACCT} [unlisted] テスト</p>`, BOT_ACCT);
    expect(resultUnlisted.options.visibility).toBe("unlisted");
  });

  it("複数コマンドを同時に解析する", () => {
    const result = parseMentionContent(
      `<p>@${BOT_ACCT} [下 赤 大 ラノベ ネオン debug keep unlisted] テスト投稿</p>`,
      BOT_ACCT,
    );
    expect(result.options).toMatchObject({
      position: "bottom",
      color: "red",
      size: "large",
      font: "light-novel-pop",
      arrangement: "neon",
      debug: true,
      keep: true,
      visibility: "unlisted",
    });
    expect(result.text).toBe("テスト投稿");
  });

  it("不明なコマンドトークンは無視する", () => {
    const result = parseMentionContent(
      `<p>@${BOT_ACCT} [上 unknown xyz] テスト</p>`,
      BOT_ACCT,
    );
    expect(result.options.position).toBe("top");
    expect(result.options.color).toBe("white"); // デフォルトのまま
  });
});

describe("parseMentionContent - ユーザーデフォルト設定", () => {
  it("ユーザーデフォルトをコマンドなしで使用する", () => {
    const result = parseMentionContent(
      `<p>@${BOT_ACCT} テスト</p>`,
      BOT_ACCT,
      { position: "right", color: "red", size: "large", font: "noto-sans-jp" },
    );
    expect(result.options.position).toBe("right");
    expect(result.options.color).toBe("red");
    expect(result.options.size).toBe("large");
    expect(result.options.font).toBe("noto-sans-jp");
  });

  it("コマンド指定がユーザーデフォルトを上書きする", () => {
    const result = parseMentionContent(
      `<p>@${BOT_ACCT} [青 小] テスト</p>`,
      BOT_ACCT,
      { color: "red", size: "large" },
    );
    expect(result.options.color).toBe("blue");
    expect(result.options.size).toBe("small");
  });

  it("null のユーザーデフォルトはシステムデフォルトを使用する", () => {
    const result = parseMentionContent(
      `<p>@${BOT_ACCT} テスト</p>`,
      BOT_ACCT,
      { position: null, color: null },
    );
    expect(result.options.position).toBe("top");
    expect(result.options.color).toBe("white");
  });
});

describe("formatOptionsSummary", () => {
  it("基本的なオプションを日本語サマリーに変換する", () => {
    const options = {
      position: "top" as const,
      font: "hui-font" as const,
      color: "white" as const,
      size: "medium" as const,
      arrangement: "none" as const,
      debug: false,
      keep: false,
    };
    const summary = formatOptionsSummary(options);
    expect(summary).toContain("位置: 上");
    expect(summary).toContain("色: 白");
    expect(summary).toContain("サイズ: 中");
    expect(summary).toContain("フォント: ふい字");
    expect(summary).toContain("debug: off");
    expect(summary).toContain("keep: off");
  });

  it("アレンジありの場合は表示される", () => {
    const options = {
      position: "top" as const,
      font: "hui-font" as const,
      color: "white" as const,
      size: "medium" as const,
      arrangement: "neon" as const,
      debug: false,
      keep: false,
    };
    const summary = formatOptionsSummary(options);
    expect(summary).toContain("アレンジ: ネオン");
  });

  it("コマンドで指定した visibility が表示される", () => {
    const options = {
      position: "top" as const,
      font: "hui-font" as const,
      color: "white" as const,
      size: "medium" as const,
      arrangement: "none" as const,
      debug: false,
      keep: false,
      visibility: "unlisted" as const,
    };
    const summary = formatOptionsSummary(options);
    expect(summary).toContain("公開範囲: 非収載");
  });

  it("デフォルト visibility が表示される（コマンド指定なしの場合）", () => {
    const options = {
      position: "top" as const,
      font: "hui-font" as const,
      color: "white" as const,
      size: "medium" as const,
      arrangement: "none" as const,
      debug: false,
      keep: false,
    };
    const summary = formatOptionsSummary(options, "public");
    expect(summary).toContain("公開範囲: 公開(デフォルト)");
  });

  it("debug/keep がオンの場合に表示される", () => {
    const options = {
      position: "top" as const,
      font: "hui-font" as const,
      color: "white" as const,
      size: "medium" as const,
      arrangement: "none" as const,
      debug: true,
      keep: true,
    };
    const summary = formatOptionsSummary(options);
    expect(summary).toContain("debug: on");
    expect(summary).toContain("keep: on");
  });
});
