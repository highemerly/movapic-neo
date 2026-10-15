import { describe, it, expect } from "vitest";
import { parseServerHostname, isAcceptableUsername } from "./serverIdentity";

describe("parseServerHostname", () => {
  it("ホスト名はスキーム・末尾スラッシュ・大文字を正規化して返す", () => {
    expect(parseServerHostname("handon.club")).toBe("handon.club");
    expect(parseServerHostname("https://Handon.Club/")).toBe("handon.club");
    expect(parseServerHostname("  handon.club  ")).toBe("handon.club");
  });

  it("末尾のドットは同じホストなので落とす（拒否リストのすり抜け防止）", () => {
    expect(parseServerHostname("spam.example.")).toBe("spam.example");
  });

  it("日本語ドメインは入力どおり（Unicode のまま）返す", () => {
    expect(parseServerHostname("日本語.jp")).toBe("日本語.jp");
    expect(parseServerHostname("xn--wgv71a119e.jp")).toBe("xn--wgv71a119e.jp");
  });

  it("ポート付きは弾く（既定ポートの :443 も。同じホストへ通信するのに別ドメイン扱いになるため）", () => {
    expect(parseServerHostname("spam.example:443")).toBeNull();
    expect(parseServerHostname("spam.example:8443")).toBeNull();
  });

  it("パス・クエリ・フラグメント・ユーザー情報付きは弾く", () => {
    expect(parseServerHostname("spam.example/x")).toBeNull();
    expect(parseServerHostname("spam.example?x")).toBeNull();
    expect(parseServerHostname("spam.example#x")).toBeNull();
    expect(parseServerHostname("user@spam.example")).toBeNull();
  });

  it("改行・タブなどの制御文字を含むものは弾く（URL パーサーは黙って除くため通信は成立してしまう）", () => {
    expect(parseServerHostname("evil.example/\nUser-Agent: *\nDisallow: /\n#")).toBeNull();
    expect(parseServerHostname("evil.\nexample")).toBeNull();
    expect(parseServerHostname("evil.\texample")).toBeNull();
  });

  it("空・空白だけは弾く", () => {
    expect(parseServerHostname("")).toBeNull();
    expect(parseServerHostname("   ")).toBeNull();
    expect(parseServerHostname("https://")).toBeNull();
  });
});

describe("isAcceptableUsername", () => {
  it("各実装のローカルユーザー名の規則に合うものは受け付ける", () => {
    expect(isAcceptableUsername("alice")).toBe(true);
    expect(isAcceptableUsername("Alice_01")).toBe(true); // Mastodon・Misskey
    expect(isAcceptableUsername("a-b")).toBe(true); // Pleroma（extended_nickname_format）
    expect(isAcceptableUsername("a".repeat(64))).toBe(true); // GoToSocial の上限
  });

  it("規則外は弾く", () => {
    expect(isAcceptableUsername("")).toBe(false);
    expect(isAcceptableUsername("a".repeat(65))).toBe(false);
    expect(isAcceptableUsername("a.b")).toBe(false); // ローカルアカウントには無い
    expect(isAcceptableUsername("a@b")).toBe(false);
    expect(isAcceptableUsername("a/b")).toBe(false);
    expect(isAcceptableUsername("x\nUser-agent: *")).toBe(false);
    expect(isAcceptableUsername(" alice")).toBe(false);
    expect(isAcceptableUsername("日本語")).toBe(false);
  });

  it("文字列以外は弾く（リモートの応答は型も保証されない）", () => {
    expect(isAcceptableUsername(undefined)).toBe(false);
    expect(isAcceptableUsername(null)).toBe(false);
    expect(isAcceptableUsername(123)).toBe(false);
  });
});
