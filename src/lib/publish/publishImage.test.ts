/**
 * publishImage の代替テキスト（ALT）配管の回帰テスト。
 *
 * 実際にあった不具合を固定する: かつて publishImage には先保存（web/email）と先投稿（mention）の
 * 2分岐があり、後者にだけ altText を渡し忘れて「DBには入るが投稿には反映されない」不具合が出た。
 * 今は全経路が先保存の1本だが、経路（source）によらず投稿と DB の両方に altText が渡ることを検証する。
 * Bot の処理済み確定（recordWithImage）が画像の登録と同じトランザクションで走ることも固定する。
 *
 * ネットワーク（fediverse/post）・S3（storage）・prisma・実績評価はすべてモックする。

 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEFAULT_POSITION,
  DEFAULT_FONT,
  DEFAULT_COLOR,
  DEFAULT_SIZE,
  DEFAULT_OUTPUT,
  DEFAULT_ARRANGEMENT,
} from "@/types";

const {
  postToMastodon,
  postToMisskey,
  imageCreate,
  imageUpdate,
  transcodeToJpeg,
  resolveFediverseReplyTarget,
  createReplyNotification,
} = vi.hoisted(() => ({
  postToMastodon: vi.fn(),
  postToMisskey: vi.fn(),
  imageCreate: vi.fn(),
  imageUpdate: vi.fn(),
  transcodeToJpeg: vi.fn(),
  resolveFediverseReplyTarget: vi.fn(),
  createReplyNotification: vi.fn(),
}));

vi.mock("@/lib/fediverse/post", () => ({
  postToMastodon,
  postToMisskey,
}));

// 保存物は AVIF・Mastodon へは JPEG に変換して送るため、投稿経路は compute を1往復する。
vi.mock("@/lib/compute/client", () => ({ transcodeToJpeg }));

vi.mock("@/lib/db", () => ({
  default: {
    image: { create: imageCreate, update: imageUpdate },
    // 画像の登録は recordWithImage と同じトランザクション。tx は同じモックを渡す。
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ image: { create: imageCreate } }),
  },
}));

vi.mock("@/lib/storage/storage", () => ({
  uploadImage: vi.fn().mockResolvedValue(undefined),
  generateStorageKey: (id: string) => `2026/07/10/${id}.avif`,
  generateThumbnailKey: (key: string) => `${key}.thumb.webp`,
  getExtensionFromMimeType: () => "avif",
}));

// リプライ先の解決（DB＋Fediverse 往復）と通知（DB）は境界としてモックする。
vi.mock("@/lib/replies/fediverseTarget", () => ({ resolveFediverseReplyTarget }));
vi.mock("@/lib/notifications/replyNotifications", () => ({ createReplyNotification }));

vi.mock("@/lib/achievements/engine", () => ({
  evaluateAndGrant: vi.fn().mockResolvedValue([]),
}));

import { publishImage, type PublishImageInput } from "@/lib/publish/publishImage";
import { evaluateAndGrant } from "@/lib/achievements/engine";

/** postToMastodon/postToMisskey はオブジェクト引数。n 回目の呼び出しの引数を返す。 */
function postArgs(mock: typeof postToMastodon, n = 0) {
  return mock.mock.calls[n][0];
}

function baseInput(overrides: Partial<PublishImageInput>): PublishImageInput {
  return {
    buffer: Buffer.from("img"),
    contentType: "image/avif",
    user: {
      id: "user-1",
      username: "alice",
      accessToken: "token",
      instance: { domain: "mastodon.example", type: "mastodon" },
    },
    text: "本文",
    options: {
      position: DEFAULT_POSITION,
      font: DEFAULT_FONT,
      color: DEFAULT_COLOR,
      size: DEFAULT_SIZE,
      outputFormat: DEFAULT_OUTPUT,
      arrangement: DEFAULT_ARRANGEMENT,
      season: null,
    },
    source: "web",
    visibility: "public",
    getThumbnailAndDimensions: async () => ({
      thumbnail: Buffer.from("thumb"),
      width: 100,
      height: 100,
      blurDataUrl: null,
    }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  postToMastodon.mockResolvedValue({
    success: true,
    postId: "s1",
    postUrl: "https://mastodon.example/@alice/s1",
  });
  postToMisskey.mockResolvedValue({
    success: true,
    postId: "n1",
    postUrl: "https://misskey.example/notes/n1",
  });
  imageCreate.mockResolvedValue({});
  imageUpdate.mockResolvedValue({});
  transcodeToJpeg.mockResolvedValue(Buffer.from("jpeg"));
  resolveFediverseReplyTarget.mockResolvedValue({ kind: "linked", postId: "parent-status" });
  createReplyNotification.mockResolvedValue(undefined);
});

describe("publishImage の ALT 配管", () => {
  it("web経路: 投稿とDBの両方にaltTextが渡る", async () => {
    await publishImage(baseInput({ altText: "茶色い猫" }));

    expect(postToMastodon).toHaveBeenCalledTimes(1);
    expect(postArgs(postToMastodon).altText).toBe("茶色い猫");
    // DB保存にも載る
    expect(imageCreate.mock.calls[0][0].data.altText).toBe("茶色い猫");
  });

  it("mention経路: 投稿とDBの両方にaltTextが渡る（回帰防止）", async () => {
    await publishImage(
      baseInput({
        source: "mention",
        altText: "元投稿から引き継いだALT",
      })
    );

    expect(postToMastodon).toHaveBeenCalledTimes(1);
    expect(postArgs(postToMastodon).altText).toBe("元投稿から引き継いだALT");
    expect(imageCreate.mock.calls[0][0].data.altText).toBe("元投稿から引き継いだALT");
  });

  it("Misskeyユーザーでも altText が postToMisskey に渡る", async () => {
    await publishImage(
      baseInput({
        user: {
          id: "user-2",
          username: "bob",
          accessToken: "token",
          instance: { domain: "misskey.example", type: "misskey" },
        },
        altText: "犬の写真",
      })
    );

    expect(postToMisskey).toHaveBeenCalledTimes(1);
    expect(postArgs(postToMisskey).altText).toBe("犬の写真");
  });

  it("altText未設定なら投稿にはundefinedが渡り、DBにはnullが入る", async () => {
    await publishImage(baseInput({ altText: undefined }));

    expect(postArgs(postToMastodon).altText).toBeUndefined();
    expect(imageCreate.mock.calls[0][0].data.altText).toBeNull();
  });

  it("前後の空白はトリムして渡す（空白のみは未設定扱い）", async () => {
    await publishImage(baseInput({ altText: "  空白あり  " }));
    expect(postArgs(postToMastodon).altText).toBe("空白あり");

    vi.clearAllMocks();
    postToMastodon.mockResolvedValue({ success: true, postId: "s1", postUrl: "u" });
    imageCreate.mockResolvedValue({});
    await publishImage(baseInput({ altText: "   " }));
    expect(postArgs(postToMastodon).altText).toBeUndefined();
    expect(imageCreate.mock.calls[0][0].data.altText).toBeNull();
  });
});

describe("publishImage は投稿を自動で再試行しない（本文作成は冪等でなく二重投稿になりうる）", () => {
  it.each([
    ["5xx（作成済みなのにプロキシが502を返すことがある）", 502],
    ["429（1.5秒待っても分単位のレート窓では回復しない）", 429],
    ["4xx", 403],
  ])("%s でも1回だけ投稿し、失敗をそのまま返す", async (_label, statusCode) => {
    postToMastodon.mockResolvedValue({ success: false, error: "failed", statusCode });
    const result = await publishImage(baseInput({}));
    expect(postToMastodon).toHaveBeenCalledTimes(1);
    expect(result.postError).toBe("failed");
    expect(result.postErrorStatus).toBe(statusCode);
  });

  it("失敗しても画像は保存され、postUrl は空のまま（利用者が再投稿でやり直せる）", async () => {
    postToMastodon.mockResolvedValue({ success: false, error: "failed", statusCode: 503 });
    await publishImage(baseInput({}));
    expect(imageCreate).toHaveBeenCalledTimes(1);
    expect(imageUpdate).not.toHaveBeenCalled();
  });
});

describe("Mastodon へのアップロード形式（保存は AVIF・送信のみ JPEG）", () => {
  it("Mastodon へは JPEG に変換したバッファを送る（DB保存は AVIF のまま）", async () => {
    await publishImage(baseInput({}));

    expect(transcodeToJpeg).toHaveBeenCalledTimes(1);
    const call = postArgs(postToMastodon);
    expect(call.imageBuffer.toString()).toBe("jpeg");
    expect(call.mimeType).toBe("image/jpeg");
    expect(call.filename).toMatch(/\.jpg$/);
    // 保存物は AVIF のまま＝変換結果はどこにも残さない
    expect(imageCreate.mock.calls[0][0].data.mimeType).toBe("image/avif");
  });

  it("Misskey へは変換せず AVIF をそのまま送る", async () => {
    await publishImage(
      baseInput({
        user: {
          id: "user-1",
          username: "alice",
          accessToken: "token",
          instance: { domain: "misskey.example", type: "misskey" },
        },
      })
    );

    expect(transcodeToJpeg).not.toHaveBeenCalled();
    const call = postArgs(postToMisskey);
    expect(call.imageBuffer.toString()).toBe("img");
    expect(call.mimeType).toBe("image/avif");
  });

  it("local（連合しない）は変換もしない", async () => {
    await publishImage(baseInput({ visibility: "local" }));

    expect(transcodeToJpeg).not.toHaveBeenCalled();
    expect(postToMastodon).not.toHaveBeenCalled();
    expect(imageCreate).toHaveBeenCalledTimes(1);
  });

  it("変換に失敗したら投稿失敗として返す（AVIF のまま送らない・画像は保存する）", async () => {
    transcodeToJpeg.mockRejectedValue(new Error("compute down"));

    const result = await publishImage(baseInput({}));

    expect(postToMastodon).not.toHaveBeenCalled();
    expect(result.postError).toBe("投稿用画像の変換に失敗しました");
    // 画像自体は残る＝再投稿でやり直せる
    expect(result.imageId).toBeDefined();
    expect(imageCreate).toHaveBeenCalledTimes(1);
  });

  it("mention経路でも変換に失敗したら画像は保存される（再投稿でやり直せる）", async () => {
    transcodeToJpeg.mockRejectedValue(new Error("compute down"));

    const result = await publishImage(baseInput({ source: "mention" }));

    expect(result.postError).toBe("投稿用画像の変換に失敗しました");
    expect(imageCreate).toHaveBeenCalledTimes(1);
  });
});

describe("リプライ（スレッド）の配管", () => {
  it("解決したリプライ先 ID を投稿に渡し、replyToId を保存し、通知を作る", async () => {
    const result = await publishImage(
      baseInput({ replyToImageId: "parent-img" })
    );

    expect(resolveFediverseReplyTarget).toHaveBeenCalledWith({
      replyToImageId: "parent-img",
      viewer: { domain: "mastodon.example", type: "mastodon", accessToken: "token" },
    });
    expect(postArgs(postToMastodon).replyToId).toBe("parent-status");
    expect(imageCreate.mock.calls[0][0].data.replyToId).toBe("parent-img");
    expect(createReplyNotification).toHaveBeenCalledWith({
      replyImageId: result.imageId,
      replierUserId: "user-1",
      parentImageId: "parent-img",
    });
    expect(result.threadBroken).toBe(false);
  });

  it("親が連合していなければ返信なしで投稿し、SHAMEZO 内だけ繋ぐ（threadBroken にしない）", async () => {
    resolveFediverseReplyTarget.mockResolvedValue({
      kind: "shamezo-only",
      reason: "parent-not-federated",
    });
    const result = await publishImage(
      baseInput({ replyToImageId: "parent-img" })
    );

    expect(postArgs(postToMastodon).replyToId).toBeNull();
    expect(imageCreate.mock.calls[0][0].data.replyToId).toBe("parent-img");
    expect(result.threadBroken).toBe(false);
  });

  it("解決できなければ単独投稿して threadBroken=true", async () => {
    resolveFediverseReplyTarget.mockResolvedValue({
      kind: "shamezo-only",
      reason: "resolve-failed",
      status: 503,
    });
    const result = await publishImage(
      baseInput({ replyToImageId: "parent-img" })
    );

    expect(postArgs(postToMastodon).replyToId).toBeNull();
    expect(imageCreate.mock.calls[0][0].data.replyToId).toBe("parent-img");
    expect(result.threadBroken).toBe(true);
  });

  it("投稿先が返信先を無効と応答し返信なしで投稿し直したら threadBroken=true", async () => {
    postToMastodon.mockResolvedValue({
      success: true,
      postId: "s1",
      postUrl: "https://mastodon.example/@alice/s1",
      replyDropped: true,
    });
    const result = await publishImage(
      baseInput({ replyToImageId: "parent-img" })
    );
    expect(result.threadBroken).toBe(true);
  });

  it("通知の作成に失敗しても投稿結果は変わらない（再送・リトライで二重投稿させない）", async () => {
    createReplyNotification.mockRejectedValue(new Error("db down"));
    const result = await publishImage(
      baseInput({ replyToImageId: "parent-img" })
    );
    expect(result.imageId).toBeDefined();
    expect(result.postError).toBeUndefined();
  });

  it("実績評価にはスレッドへの投稿かどうか（実際に保存した replyToId）を渡す", async () => {
    await publishImage(baseInput({ replyToImageId: "parent-img" }));
    expect(vi.mocked(evaluateAndGrant).mock.calls[0][0].post.isReply).toBe(true);

    vi.mocked(evaluateAndGrant).mockClear();
    await publishImage(baseInput({}));
    expect(vi.mocked(evaluateAndGrant).mock.calls[0][0].post.isReply).toBe(false);
  });

  it("リプライでなければ解決も通知もしない", async () => {
    const result = await publishImage(baseInput({}));
    expect(resolveFediverseReplyTarget).not.toHaveBeenCalled();
    expect(createReplyNotification).not.toHaveBeenCalled();
    expect(imageCreate.mock.calls[0][0].data.replyToId).toBeNull();
    expect(postArgs(postToMastodon).replyToId).toBeNull();
    expect(result.threadBroken).toBe(false);
  });

  it("local は連合しないので解決しない（SHAMEZO 内では繋ぐ・通知は作る）", async () => {
    const result = await publishImage(
      baseInput({ visibility: "local", replyToImageId: "parent-img" })
    );
    expect(resolveFediverseReplyTarget).not.toHaveBeenCalled();
    expect(postToMastodon).not.toHaveBeenCalled();
    expect(imageCreate.mock.calls[0][0].data.replyToId).toBe("parent-img");
    expect(createReplyNotification).toHaveBeenCalledTimes(1);
    expect(result.threadBroken).toBe(false);
  });

  it("mention経路でも投稿に失敗したら画像は保存し、通知も作る（web と同じ）", async () => {
    postToMastodon.mockResolvedValue({ success: false, error: "forbidden", statusCode: 403 });
    const result = await publishImage(
      baseInput({ source: "mention", replyToImageId: "parent-img" })
    );
    expect(result.postError).toBe("forbidden");
    expect(imageCreate).toHaveBeenCalledTimes(1);
    expect(createReplyNotification).toHaveBeenCalledTimes(1);
  });
});

describe("recordWithImage（Bot の処理済み確定）", () => {
  it("画像の登録と同じトランザクションで、登録の後に実行する", async () => {
    const order: string[] = [];
    imageCreate.mockImplementation(async () => {
      order.push("image.create");
    });
    const recordWithImage = vi.fn(async () => {
      order.push("record");
    });
    await publishImage(baseInput({ source: "mention", recordWithImage }));

    expect(order).toEqual(["image.create", "record"]);
    expect(recordWithImage).toHaveBeenCalledWith({ image: { create: imageCreate } });
  });

  it("確定に失敗したら投稿しない（保存もロールバックされ、やり直しで二重にならない）", async () => {
    const recordWithImage = vi.fn(async () => {
      throw new Error("db down");
    });
    await expect(publishImage(baseInput({ source: "mention", recordWithImage }))).rejects.toThrow(
      "db down"
    );
    expect(postToMastodon).not.toHaveBeenCalled();
  });
});
