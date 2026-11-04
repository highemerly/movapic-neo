import { describe, it, expect } from "vitest";
import { replierName, replyNotificationDetail } from "./replyNotificationType";

describe("リプライ通知の文言", () => {
  it("2行目はアイコンの後ろに続く文。ベルは短く、通知ページは文章", () => {
    expect(replyNotificationDetail("bell", true)).toBe("さんがスレッドに投稿");
    expect(replyNotificationDetail("page", true)).toBe("さんがあなたのスレッドに投稿しました。");
  });

  it("投稿者が取れなければ主語を省く", () => {
    expect(replyNotificationDetail("bell", false)).toBe("スレッドに投稿されました");
    expect(replyNotificationDetail("page", false)).toBe("あなたのスレッドに投稿されました。");
  });

  it("アイコンの名前は表示名、無ければ acct のローカル部（ドメインは出さない）", () => {
    expect(replierName({ displayName: "ボブ", acct: "bob@ex.com", avatarUrl: null })).toBe("ボブ");
    expect(replierName({ displayName: "  ", acct: "bob@ex.com", avatarUrl: null })).toBe("bob");
  });
});
