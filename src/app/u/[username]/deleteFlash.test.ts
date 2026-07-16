/**
 * 削除完了トースト文言（buildDeleteFlash）の回帰テスト。
 * クエリ（deleted・server）から成功メッセージを組み立て、連携先削除時はサーバー名を前面に出す。
 */

import { describe, it, expect } from "vitest";
import { buildDeleteFlash } from "./deleteFlash";

describe("buildDeleteFlash", () => {
  it("deleted=1 は local のみ削除の完了メッセージ", () => {
    expect(buildDeleteFlash("1", undefined)).toEqual({
      variant: "success",
      message: "投稿を削除しました",
    });
  });

  it("deleted=remote はサーバー名入りで連携先も削除した旨を含む", () => {
    expect(buildDeleteFlash("remote", "handon.club")).toEqual({
      variant: "success",
      message: "投稿を削除しました（handon.clubの投稿も削除しました）",
    });
  });

  it("deleted=remote でサーバー名が無いときは汎用メッセージにフォールバック", () => {
    expect(buildDeleteFlash("remote", undefined)).toEqual({
      variant: "success",
      message: "投稿を削除しました",
    });
  });

  it("削除以外の遷移（未指定・不明値）は null", () => {
    expect(buildDeleteFlash(undefined, undefined)).toBeNull();
    expect(buildDeleteFlash("", undefined)).toBeNull();
    expect(buildDeleteFlash("mastodon", "handon.club")).toBeNull();
  });
});
