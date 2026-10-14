import { describe, it, expect } from "vitest";
import {
  replyNotificationText,
  replyNotificationTitle,
  replyNotificationWho,
} from "./replyNotificationType";

describe("リプライ通知の文言", () => {
  it("表示名があれば表示名で出す", () => {
    const reply = { displayName: "ボブ", acct: "bob@ex.com" };
    expect(replyNotificationText(reply)).toBe("💬 ボブさんがあなたの写真にスレッドで投稿しました");
    expect(replyNotificationWho(reply)).toBe("ボブさんがあなたの写真に続けて投稿しました");
  });

  it("表示名が無ければ acct のローカル部で出す（ドメインは出さない）", () => {
    const reply = { displayName: "  ", acct: "bob@ex.com" };
    expect(replyNotificationText(reply)).toBe("💬 bobさんがあなたの写真にスレッドで投稿しました");
  });

  it("相手が分からなければ受け身で出す", () => {
    expect(replyNotificationText(null)).toBe("💬 あなたの写真にスレッドで投稿されました");
    expect(replyNotificationWho(null)).toBe("あなたの写真に続けて投稿されました");
  });

  it("一覧の1行目は固定", () => {
    expect(replyNotificationTitle()).toBe("スレッドに投稿されました");
  });
});
