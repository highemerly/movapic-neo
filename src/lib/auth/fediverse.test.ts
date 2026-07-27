/**
 * normalizeServer の回帰テスト。
 *
 * ログイン開始（register）・インスタンス検出・DBの Instance.domain が全てこの戻り値で
 * 揃う前提のため、ここがブレると「同じサーバーなのに別インスタンス扱い」や
 * 不可解な検出失敗になる。ユーザーが手入力する値が入口なので、貼り付けで混ざる
 * プロトコル・大文字・末尾スラッシュを確実に落とせることを固定する。
 *
 * 外部通信を伴う関数（detectInstanceType 等）は本ファイルの対象外。
 */

import { describe, it, expect } from "vitest";
import { normalizeServer } from "./fediverse";

describe("normalizeServer", () => {
  it("素のドメインはそのまま", () => {
    expect(normalizeServer("mastodon.example")).toBe("mastodon.example");
  });

  it("http/https のプロトコルを除去する", () => {
    expect(normalizeServer("https://mastodon.example")).toBe("mastodon.example");
    expect(normalizeServer("http://mastodon.example")).toBe("mastodon.example");
  });

  it("大文字混じりのプロトコルも除去する（pitfall: i フラグ無しだと剥がれず、"
    + "小文字化後に \"https://…\" がドメイン名として残る）", () => {
    expect(normalizeServer("HTTPS://Mastodon.Example")).toBe("mastodon.example");
    expect(normalizeServer("Https://mastodon.example")).toBe("mastodon.example");
    expect(normalizeServer("HTTP://MASTODON.EXAMPLE")).toBe("mastodon.example");
  });

  it("末尾のスラッシュは連続していても除去する", () => {
    expect(normalizeServer("mastodon.example/")).toBe("mastodon.example");
    expect(normalizeServer("https://mastodon.example///")).toBe("mastodon.example");
  });

  it("ホスト名は小文字に揃える", () => {
    expect(normalizeServer("MASTODON.EXAMPLE")).toBe("mastodon.example");
  });

  it("ポート付きはポートを保持する", () => {
    expect(normalizeServer("https://Localhost:3000/")).toBe("localhost:3000");
  });

  it("プロトコル・大文字・末尾スラッシュが同時でも1つの結果に落ちる", () => {
    const expected = "mastodon.example";
    for (const input of [
      "mastodon.example",
      "Mastodon.Example",
      "https://mastodon.example",
      "HTTPS://Mastodon.Example/",
      "http://MASTODON.EXAMPLE//",
    ]) {
      expect(normalizeServer(input)).toBe(expected);
    }
  });
});
