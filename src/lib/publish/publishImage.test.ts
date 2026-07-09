/**
 * publishImage の代替テキスト（ALT）配管の回帰テスト。
 *
 * 実際にあった不具合を固定する: publishImage には投稿呼び出しが2分岐ある。
 *   - persistOnPostFailure=true / local … 先に保存してから投稿（web/email）
 *   - persistOnPostFailure=false      … 先に投稿し成功時のみ保存（mention）
 * かつて後者の分岐にだけ altText を渡し忘れ、「DBには入るが投稿には反映されない」
 * という不具合が出た。両分岐とも postToMastodon/postToMisskey に altText を渡すことを検証する。
 *
 * ネットワーク（fediverse/post）・R2（storage）・prisma・実績評価はすべてモックする。
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

const { postToMastodon, postToMisskey, imageCreate, imageUpdate } = vi.hoisted(() => ({
  postToMastodon: vi.fn(),
  postToMisskey: vi.fn(),
  imageCreate: vi.fn(),
  imageUpdate: vi.fn(),
}));

vi.mock("@/lib/fediverse/post", () => ({
  postToMastodon,
  postToMisskey,
}));

vi.mock("@/lib/db", () => ({
  default: { image: { create: imageCreate, update: imageUpdate } },
}));

vi.mock("@/lib/storage/storage", () => ({
  uploadImage: vi.fn().mockResolvedValue(undefined),
  generateStorageKey: (id: string) => `2026/07/10/${id}.avif`,
  generateThumbnailKey: (key: string) => `${key}.thumb.webp`,
  getExtensionFromMimeType: () => "avif",
}));

vi.mock("@/lib/achievements/engine", () => ({
  evaluateAndGrant: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/achievements/makeupAssign", () => ({
  assignMakeupForNewPost: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/achievements/perfectMonth", () => ({
  perfectMonthGrace: vi.fn(),
}));

import { publishImage, type PublishImageInput } from "@/lib/publish/publishImage";

// altText は postToMastodon/postToMisskey の第9引数（index 8）に渡る。
const ALT_ARG_INDEX = 8;

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
});

describe("publishImage の ALT 配管", () => {
  it("web経路（persistOnPostFailure=true）: 投稿とDBの両方にaltTextが渡る", async () => {
    await publishImage(baseInput({ persistOnPostFailure: true, altText: "茶色い猫" }));

    expect(postToMastodon).toHaveBeenCalledTimes(1);
    expect(postToMastodon.mock.calls[0][ALT_ARG_INDEX]).toBe("茶色い猫");
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
    expect(postToMastodon.mock.calls[0][ALT_ARG_INDEX]).toBe("元投稿から引き継いだALT");
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
    expect(postToMisskey.mock.calls[0][ALT_ARG_INDEX]).toBe("犬の写真");
  });

  it("altText未設定なら投稿にはundefinedが渡り、DBにはnullが入る", async () => {
    await publishImage(baseInput({ altText: undefined }));

    expect(postToMastodon.mock.calls[0][ALT_ARG_INDEX]).toBeUndefined();
    expect(imageCreate.mock.calls[0][0].data.altText).toBeNull();
  });

  it("前後の空白はトリムして渡す（空白のみは未設定扱い）", async () => {
    await publishImage(baseInput({ altText: "  空白あり  " }));
    expect(postToMastodon.mock.calls[0][ALT_ARG_INDEX]).toBe("空白あり");

    vi.clearAllMocks();
    postToMastodon.mockResolvedValue({ success: true, postId: "s1", postUrl: "u" });
    imageCreate.mockResolvedValue({});
    await publishImage(baseInput({ altText: "   " }));
    expect(postToMastodon.mock.calls[0][ALT_ARG_INDEX]).toBeUndefined();
    expect(imageCreate.mock.calls[0][0].data.altText).toBeNull();
  });
});
