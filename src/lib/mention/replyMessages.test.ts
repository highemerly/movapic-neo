import { describe, it, expect } from "vitest";
import { federationFailedMessage } from "./replyMessages";

const base = {
  serverDomain: "mastodon.example",
  imagePageUrl: "https://shamezo.example/u/alice@mastodon.example/status/img-1",
};

describe("federationFailedMessage", () => {
  it("保存済みであることと、画像ページからの再投稿を案内する", () => {
    expect(federationFailedMessage({ ...base, statusCode: 503 })).toBe(
      "SHAMEZOには投稿できましたが、mastodon.exampleへの投稿に失敗しました。" +
        "https://shamezo.example/u/alice@mastodon.example/status/img-1 から再投稿することもできます。"
    );
  });

  it("タイムアウト等でステータスが無くても同じ文言", () => {
    expect(federationFailedMessage({ ...base, statusCode: undefined })).toBe(
      federationFailedMessage({ ...base, statusCode: 503 })
    );
  });

  it.each([401, 403])("連携失効（%i）のときはログインし直してからの再投稿を案内する", (statusCode) => {
    expect(federationFailedMessage({ ...base, statusCode })).toBe(
      "SHAMEZOには投稿できましたが、mastodon.exampleへの投稿に失敗しました。" +
        "mastodon.example との連携が切れている可能性がありますので、" +
        "SHAMEZO に一度ログインしてから再投稿してみてください。"
    );
  });
});
