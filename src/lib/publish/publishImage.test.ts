/**
 * publishImage の代替テキスト（ALT）配管の回帰テスト。
 *
 * 実際にあった不具合を固定する: publishImage には投稿呼び出しが2分岐ある。
 *   - persistOnPostFailure=true / local … 先に保存してから投稿（web/email）
 *   - persistOnPostFailure=false      … 先に投稿し成功時のみ保存（mention）
 * かつて後者の分岐にだけ altText を渡し忘れ、「DBには入るが投稿には反映されない」
 * という不具合が出た。両分岐とも postToMastodon/postToMisskey に altText を渡すことを検証する。
 *
 * ネットワーク（fediverse/post）・S3（storage）・prisma・実績評価はすべてモックする。
 *
 * あわせて、自動穴埋め（autoMakeup）が 2026-09 以前の月の投稿にだけ効くことも固定する
 *（2026-10 以降は穴埋めポイント制で手動のみ。9月中は設定どおり自動で動かす）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
  default: { image: { create: imageCreate, update: imageUpdate } },
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

vi.mock("@/lib/achievements/makeupAssign", () => ({
  assignMakeupForNewPost: vi.fn().mockResolvedValue(undefined),
}));

// perfectMonthGrace の定義は grace.ts（env を読む）。以前は perfectMonth.ts をモックしていたが、
// 自動穴埋めの分岐を通るテストが無かったため誤りが表に出ていなかった。
vi.mock("@/lib/achievements/grace", () => ({
  perfectMonthGrace: vi.fn(() => 3),
}));

import { publishImage, type PublishImageInput } from "@/lib/publish/publishImage";
import { assignMakeupForNewPost } from "@/lib/achievements/makeupAssign";

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
      autoMakeup: false,
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
    persistOnPostFailure: true,
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
  it("web経路（persistOnPostFailure=true）: 投稿とDBの両方にaltTextが渡る", async () => {
    await publishImage(baseInput({ persistOnPostFailure: true, altText: "茶色い猫" }));

    expect(postToMastodon).toHaveBeenCalledTimes(1);
    expect(postArgs(postToMastodon).altText).toBe("茶色い猫");
    // DB保存にも載る
    expect(imageCreate.mock.calls[0][0].data.altText).toBe("茶色い猫");
  });

  it("mention経路（persistOnPostFailure=false）: 投稿にaltTextが渡る（回帰防止）", async () => {
    await publishImage(
      baseInput({
        source: "mention",
        persistOnPostFailure: false,
        altText: "元投稿から引き継いだALT",
      })
    );

    expect(postToMastodon).toHaveBeenCalledTimes(1);
    expect(postArgs(postToMastodon).altText).toBe("元投稿から引き継いだALT");
  });

  it("Misskeyユーザーでも altText が postToMisskey に渡る", async () => {
    await publishImage(
      baseInput({
        user: {
          id: "user-2",
          username: "bob",
          accessToken: "token",
          instance: { domain: "misskey.example", type: "misskey" },
          autoMakeup: false,
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

describe("publishImage の投稿再試行（一時的失敗のみ1回だけ）", () => {
  it("5xx は1回だけ再試行する", async () => {
    postToMastodon.mockResolvedValue({ success: false, error: "server error", statusCode: 503 });
    await publishImage(baseInput({}));
    expect(postToMastodon).toHaveBeenCalledTimes(2);
  });

  it("429（レート制限）も1回だけ再試行する", async () => {
    postToMastodon.mockResolvedValue({ success: false, error: "rate limited", statusCode: 429 });
    await publishImage(baseInput({}));
    expect(postToMastodon).toHaveBeenCalledTimes(2);
  });

  it("429以外の4xxは再試行しない", async () => {
    postToMastodon.mockResolvedValue({ success: false, error: "forbidden", statusCode: 403 });
    await publishImage(baseInput({}));
    expect(postToMastodon).toHaveBeenCalledTimes(1);
  });

  it("timeout/接続失敗（statusCode なし）は再試行しない", async () => {
    postToMastodon.mockResolvedValue({ success: false, error: "timeout" });
    await publishImage(baseInput({}));
    expect(postToMastodon).toHaveBeenCalledTimes(1);
  });

  it("成功時は再試行しない", async () => {
    await publishImage(baseInput({}));
    expect(postToMastodon).toHaveBeenCalledTimes(1);
  });

  it("2回目で成功すれば postUrl/postId がDBに反映される", async () => {
    postToMastodon
      .mockResolvedValueOnce({ success: false, error: "server error", statusCode: 500 })
      .mockResolvedValueOnce({
        success: true,
        postId: "s2",
        postUrl: "https://mastodon.example/@alice/s2",
      });
    await publishImage(baseInput({}));
    expect(postToMastodon).toHaveBeenCalledTimes(2);
    expect(imageUpdate.mock.calls[0][0].data.postUrl).toBe(
      "https://mastodon.example/@alice/s2"
    );
    expect(imageUpdate.mock.calls[0][0].data.postId).toBe("s2");
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
          autoMakeup: false,
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

  it("再試行しても変換は1回だけ（変換済みバッファを使い回す）", async () => {
    postToMastodon.mockResolvedValue({
      success: false,
      error: "server error",
      statusCode: 503,
    });
    await publishImage(baseInput({}));

    expect(postToMastodon).toHaveBeenCalledTimes(2);
    expect(transcodeToJpeg).toHaveBeenCalledTimes(1);
  });

  it("変換に失敗したら投稿失敗として返す（AVIF のまま送らない・画像は保存する）", async () => {
    transcodeToJpeg.mockRejectedValue(new Error("compute down"));

    const result = await publishImage(baseInput({}));

    expect(postToMastodon).not.toHaveBeenCalled();
    expect(result.postError).toBe("投稿用画像の変換に失敗しました");
    // persistOnPostFailure=true なので画像自体は残る＝再投稿でやり直せる
    expect(result.imageId).toBeDefined();
    expect(imageCreate).toHaveBeenCalledTimes(1);
  });

  it("mention経路（persistOnPostFailure=false）で変換に失敗したら保存しない", async () => {
    transcodeToJpeg.mockRejectedValue(new Error("compute down"));

    const result = await publishImage(baseInput({ persistOnPostFailure: false }));

    expect(result.imageId).toBeUndefined();
    expect(imageCreate).not.toHaveBeenCalled();
  });
});

describe("自動穴埋め（autoMakeup）は 2026-09 以前の月だけ", () => {
  const autoOn = (): PublishImageInput["user"] => ({
    id: "user-1",
    username: "alice",
    accessToken: "token",
    instance: { domain: "mastodon.example", type: "mastodon" },
    autoMakeup: true,
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("9月30日 23:59 JST の投稿は、設定がONなら自動で割り当てる", async () => {
    vi.setSystemTime(new Date("2026-09-30T14:59:00Z"));

    await publishImage(baseInput({ user: autoOn() }));

    expect(assignMakeupForNewPost).toHaveBeenCalledTimes(1);
  });

  it("10月1日 00:00 JST 以降の投稿は、設定がONでも自動で割り当てない", async () => {
    vi.setSystemTime(new Date("2026-09-30T15:00:00Z"));

    await publishImage(baseInput({ user: autoOn() }));

    expect(assignMakeupForNewPost).not.toHaveBeenCalled();
  });

  it("9月でも設定がOFFなら割り当てない（従来どおり）", async () => {
    vi.setSystemTime(new Date("2026-09-20T03:00:00Z"));

    await publishImage(baseInput({}));

    expect(assignMakeupForNewPost).not.toHaveBeenCalled();
  });
});

describe("リプライ（スレッド）の配管", () => {
  // 両分岐（先保存 web/email・先投稿 mention）で同じ結果になることを固定する（ALT と同じ漏れ方を防ぐ）。
  const branches = [
    { name: "web経路（persistOnPostFailure=true）", persistOnPostFailure: true },
    { name: "mention経路（persistOnPostFailure=false）", persistOnPostFailure: false },
  ];

  for (const b of branches) {
    describe(b.name, () => {
      it("解決したリプライ先 ID を投稿に渡し、replyToId を保存し、通知を作る", async () => {
        const result = await publishImage(
          baseInput({ persistOnPostFailure: b.persistOnPostFailure, replyToImageId: "parent-img" })
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
          baseInput({ persistOnPostFailure: b.persistOnPostFailure, replyToImageId: "parent-img" })
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
          baseInput({ persistOnPostFailure: b.persistOnPostFailure, replyToImageId: "parent-img" })
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
          baseInput({ persistOnPostFailure: b.persistOnPostFailure, replyToImageId: "parent-img" })
        );
        expect(result.threadBroken).toBe(true);
      });

      it("通知の作成に失敗しても投稿結果は変わらない（再送・リトライで二重投稿させない）", async () => {
        createReplyNotification.mockRejectedValue(new Error("db down"));
        const result = await publishImage(
          baseInput({ persistOnPostFailure: b.persistOnPostFailure, replyToImageId: "parent-img" })
        );
        expect(result.imageId).toBeDefined();
        expect(result.postError).toBeUndefined();
      });
    });
  }

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

  it("mention経路で解決時に親が既に無ければ replyToId を保存せず通知もしない", async () => {
    resolveFediverseReplyTarget.mockResolvedValue({ kind: "shamezo-only", reason: "parent-gone" });
    await publishImage(baseInput({ persistOnPostFailure: false, replyToImageId: "gone-img" }));
    expect(imageCreate.mock.calls[0][0].data.replyToId).toBeNull();
    expect(createReplyNotification).not.toHaveBeenCalled();
  });

  it("mention経路で投稿に失敗したら保存も通知もしない", async () => {
    postToMastodon.mockResolvedValue({ success: false, error: "forbidden", statusCode: 403 });
    const result = await publishImage(
      baseInput({ persistOnPostFailure: false, replyToImageId: "parent-img" })
    );
    expect(result.imageId).toBeUndefined();
    expect(imageCreate).not.toHaveBeenCalled();
    expect(createReplyNotification).not.toHaveBeenCalled();
  });
});
