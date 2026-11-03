import { describe, it, expect } from "vitest";
import { replierName, replyNotificationText } from "./replyNotificationType";

describe("リプライ通知の文言", () => {
  it("本文は名前を出さず種別だけ", () => {
    expect(replyNotificationText()).toBe("💬 スレッドに投稿");
  });

  it("アイコンの名前は表示名、無ければ acct のローカル部（ドメインは出さない）", () => {
    expect(replierName({ displayName: "ボブ", acct: "bob@ex.com", avatarUrl: null })).toBe("ボブ");
    expect(replierName({ displayName: "  ", acct: "bob@ex.com", avatarUrl: null })).toBe("bob");
  });
});
