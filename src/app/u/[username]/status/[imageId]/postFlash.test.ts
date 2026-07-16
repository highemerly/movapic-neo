/**
 * 投稿結果トースト文言（buildPostFlash）の回帰テスト。
 * 成功/失敗の文言・ステータス別の対処案内・改行構造を固定する。
 */

import { describe, it, expect } from "vitest";
import { buildPostFlash } from "./postFlash";

const SERVER = "handon.club";

describe("buildPostFlash 成功", () => {
  it("Fediverse投稿成功はサーバー名入りの完了メッセージ", () => {
    const flash = buildPostFlash({
      fediverseFailed: false,
      fediversePosted: true,
      serverDomain: SERVER,
    });
    expect(flash).toEqual({
      variant: "success",
      message: "handon.club への投稿が完了しました",
    });
  });

  it("local（連合なし）成功は汎用の完了メッセージ", () => {
    const flash = buildPostFlash({
      fediverseFailed: false,
      fediversePosted: false,
      serverDomain: SERVER,
    });
    expect(flash).toEqual({
      variant: "success",
      message: "投稿が完了しました",
    });
  });
});

describe("buildPostFlash 失敗", () => {
  it("応答なし（statusなし）: タイトルに応答なし、原因＋対処を改行で持つ", () => {
    const flash = buildPostFlash({
      fediverseFailed: true,
      fediversePosted: false,
      serverDomain: SERVER,
    });
    expect(flash.variant).toBe("warning");
    expect(flash.message).toBe(
      "handon.club への投稿に失敗しました（サーバーからの応答： 応答なし）"
    );
    expect(flash.description).toBe(
      "handon.club が過負荷、または障害が発生している可能性があります\nしばらく待ってから、この投稿の「⋯（その他）」メニューから再投稿してください"
    );
    expect(flash.descriptionClassName).toBe("whitespace-pre-line");
    // 完了ではないので自動で消さない
    expect(flash.duration).toBe(Infinity);
  });

  it("5xx は過負荷系の案内、タイトルにステータスコード", () => {
    const flash = buildPostFlash({
      fediverseFailed: true,
      fediversePosted: false,
      serverDomain: SERVER,
      statusCode: 503,
    });
    expect(flash.message).toBe(
      "handon.club への投稿に失敗しました（サーバーからの応答： 503）"
    );
    expect(flash.description).toContain("過負荷");
  });

  it("429 はリクエスト集中の案内", () => {
    const flash = buildPostFlash({
      fediverseFailed: true,
      fediversePosted: false,
      serverDomain: SERVER,
      statusCode: 429,
    });
    expect(flash.description).toContain("リクエストが集中");
    expect(flash.description).toContain("「⋯（その他）」メニューから再投稿");
  });

  it("401/403 は権限不足＋再ログインを促す", () => {
    for (const code of [401, 403]) {
      const flash = buildPostFlash({
        fediverseFailed: true,
        fediversePosted: false,
        serverDomain: SERVER,
        statusCode: code,
      });
      expect(flash.description).toContain("投稿権限が不足");
      expect(flash.description).toContain("再ログイン");
    }
  });

  it("404/410 は投稿先なし・閉鎖＋再ログインを促す", () => {
    for (const code of [404, 410]) {
      const flash = buildPostFlash({
        fediverseFailed: true,
        fediversePosted: false,
        serverDomain: SERVER,
        statusCode: code,
      });
      expect(flash.description).toContain("見つからない");
      expect(flash.description).toContain("再ログイン");
    }
  });

  it("422 は内容を受け付けられなかった案内", () => {
    const flash = buildPostFlash({
      fediverseFailed: true,
      fediversePosted: false,
      serverDomain: SERVER,
      statusCode: 422,
    });
    expect(flash.description).toContain("受け付けませんでした");
  });

  it("その他4xx は汎用エラー案内", () => {
    const flash = buildPostFlash({
      fediverseFailed: true,
      fediversePosted: false,
      serverDomain: SERVER,
      statusCode: 400,
    });
    expect(flash.description).toContain("エラーが発生しました");
  });
});
