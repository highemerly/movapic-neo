import { describe, it, expect } from "vitest";
import {
  canViewerReactWith,
  FAVOURITE_KEY,
  isCustomEmojiKey,
  isSelectableUnicodeEmoji,
  normalizeReactionKey,
  normalizeUnicodeEmoji,
  parseCustomEmojiKey,
  reactionEmojisKeyToInternal,
  toDisplayEmoji,
  toMisskeyReaction,
} from "./emojiKey";

describe("normalizeReactionKey", () => {
  it("ローカル絵文字表記 :name@.: を取得元ドメインで完全修飾する", () => {
    expect(normalizeReactionKey(":ikuiku@.:", "misskey.io")).toBe(":ikuiku@misskey.io:");
  });

  it("ホスト省略の :name: も取得元ドメインで完全修飾する", () => {
    expect(normalizeReactionKey(":ikuiku:", "misskey.io")).toBe(":ikuiku@misskey.io:");
  });

  it("リモート絵文字 :name@host: はホストを保つ", () => {
    expect(normalizeReactionKey(":doecchi@mk.shrimpia.network:", "misskey.io")).toBe(
      ":doecchi@mk.shrimpia.network:"
    );
  });

  it("ホストは小文字化して比較できるようにする", () => {
    expect(normalizeReactionKey(":foo@Misskey.IO:", "example.com")).toBe(
      ":foo@misskey.io:"
    );
    expect(normalizeReactionKey(":foo@.:", "Misskey.IO")).toBe(":foo@misskey.io:");
  });

  it("Unicode絵文字はそのまま返す", () => {
    expect(normalizeReactionKey("👍", "misskey.io")).toBe("👍");
  });

  it("異体字セレクタを除去する（Misskeyが保存時に落とすため）", () => {
    expect(normalizeReactionKey("❤️", "misskey.io")).toBe("❤");
    expect(normalizeReactionKey("⁉️", "misskey.io")).toBe("⁉");
  });

  it("前後の空白を落とす", () => {
    expect(normalizeReactionKey("  🎉 ", "misskey.io")).toBe("🎉");
  });

  it("絵文字名に使える記号（_ + -）を含む名前を扱える", () => {
    expect(normalizeReactionKey(":a_b-c+d@.:", "misskey.io")).toBe(
      ":a_b-c+d@misskey.io:"
    );
  });
});

describe("parseCustomEmojiKey / isCustomEmojiKey", () => {
  it("完全修飾キーを name と host に分解する", () => {
    expect(parseCustomEmojiKey(":ai@misskey.io:")).toEqual({
      name: "ai",
      host: "misskey.io",
    });
  });

  it("ホスト未解決の表記は完全修飾キーとして扱わない", () => {
    expect(parseCustomEmojiKey(":ai:")).toBeNull();
    expect(parseCustomEmojiKey(":ai@.:")).toBeNull();
  });

  it("Unicode絵文字は null", () => {
    expect(parseCustomEmojiKey("👍")).toBeNull();
    expect(isCustomEmojiKey("👍")).toBe(false);
  });

  it("完全修飾キーなら isCustomEmojiKey が true", () => {
    expect(isCustomEmojiKey(":ai@misskey.io:")).toBe(true);
  });
});

describe("toMisskeyReaction", () => {
  it("自サーバーのカスタム絵文字はホストを落として :name: で送る", () => {
    expect(toMisskeyReaction(":ai@misskey.io:", "misskey.io")).toBe(":ai:");
    expect(toMisskeyReaction(":ai@misskey.io:", "Misskey.IO")).toBe(":ai:");
  });

  it("他サーバーのカスタム絵文字は完全修飾のまま送る", () => {
    expect(toMisskeyReaction(":ai@misskey.io:", "example.com")).toBe(":ai@misskey.io:");
  });

  it("Unicode絵文字はそのまま送る", () => {
    expect(toMisskeyReaction("👍", "misskey.io")).toBe("👍");
  });
});

describe("reactionEmojisKeyToInternal", () => {
  it("reactionEmojis の name@host 形式を内部キーに直す", () => {
    expect(
      reactionEmojisKeyToInternal("doecchi@mk.shrimpia.network", "misskey.io")
    ).toBe(":doecchi@mk.shrimpia.network:");
  });
});

describe("toDisplayEmoji", () => {
  it("既定がテキスト表示の絵文字に異体字セレクタを補う", () => {
    expect(toDisplayEmoji("❤")).toBe("❤️");
    expect(toDisplayEmoji("☺")).toBe("☺️");
  });

  it("既に絵文字表示のものはそのまま", () => {
    expect(toDisplayEmoji("👍")).toBe("👍");
    expect(toDisplayEmoji("⭐")).toBe("⭐");
  });

  it("カスタム絵文字キーは触らない", () => {
    expect(toDisplayEmoji(":ai@misskey.io:")).toBe(":ai@misskey.io:");
  });

  it("Fediverseお気に入りキー(FAVOURITE_KEY=❤)は ❤️ に補う", () => {
    expect(FAVOURITE_KEY).toBe("❤");
    expect(toDisplayEmoji(FAVOURITE_KEY)).toBe("❤️");
  });
});

describe("isSelectableUnicodeEmoji", () => {
  it("絵文字1個なら true（結合絵文字・肌色修飾も1個として扱う）", () => {
    expect(isSelectableUnicodeEmoji("👍")).toBe(true);
    expect(isSelectableUnicodeEmoji("❤️")).toBe(true);
    expect(isSelectableUnicodeEmoji("👍🏽")).toBe(true);
    expect(isSelectableUnicodeEmoji("👨‍👩‍👧")).toBe(true);
    expect(isSelectableUnicodeEmoji("🇯🇵")).toBe(true);
  });

  it("絵文字以外・複数文字・空文字は false", () => {
    expect(isSelectableUnicodeEmoji("あ")).toBe(false);
    expect(isSelectableUnicodeEmoji("👍👍")).toBe(false);
    expect(isSelectableUnicodeEmoji("")).toBe(false);
  });

  it("カスタム絵文字は選択させない", () => {
    expect(isSelectableUnicodeEmoji(":ai@misskey.io:")).toBe(false);
    expect(isSelectableUnicodeEmoji(":ai:")).toBe(false);
  });

  it("Fediverseお気に入りキー(❤)は選択できる（普通の絵文字）", () => {
    expect(isSelectableUnicodeEmoji(FAVOURITE_KEY)).toBe(true);
  });
});

describe("canViewerReactWith", () => {
  it("MastodonはUnicode絵文字なら送れる（favourite/❤含む）", () => {
    expect(canViewerReactWith("👍", "mastodon", "mstdn.example")).toBe(true);
    expect(canViewerReactWith(FAVOURITE_KEY, "mastodon", "mstdn.example")).toBe(true);
  });

  it("Mastodonはカスタム絵文字を送れない（自サーバーのものでも）", () => {
    expect(canViewerReactWith(":ai@mstdn.example:", "mastodon", "mstdn.example")).toBe(false);
    expect(canViewerReactWith(":ai@misskey.io:", "mastodon", "mstdn.example")).toBe(false);
  });

  it("MisskeyはUnicode絵文字を送れる", () => {
    expect(canViewerReactWith("🎉", "misskey", "misskey.io")).toBe(true);
  });

  it("Misskeyは自分のサーバーのカスタム絵文字だけ送れる", () => {
    expect(canViewerReactWith(":ai@misskey.io:", "misskey", "misskey.io")).toBe(true);
    // ホストの大小は問わない（内部キーは小文字化済みだが呼び出し側ドメインが大文字でも一致）
    expect(canViewerReactWith(":ai@misskey.io:", "misskey", "Misskey.IO")).toBe(true);
  });

  it("Misskeyでも他サーバーのカスタム絵文字は送れない", () => {
    expect(canViewerReactWith(":ai@misskey.io:", "misskey", "example.com")).toBe(false);
  });

  it("絵文字として不正な文字列は送れない", () => {
    expect(canViewerReactWith("あ", "mastodon", "mstdn.example")).toBe(false);
    expect(canViewerReactWith("あ", "misskey", "misskey.io")).toBe(false);
  });
});

describe("normalizeUnicodeEmoji", () => {
  it("異体字セレクタだけを落とす", () => {
    expect(normalizeUnicodeEmoji("❤️")).toBe("❤");
    expect(normalizeUnicodeEmoji("👍")).toBe("👍");
  });
});
