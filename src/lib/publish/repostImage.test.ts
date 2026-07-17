/**
 * 再投稿（repostImage）のロジックテスト。
 *
 * 対象条件（オーナー/未投稿/期間内）と、投稿成否によるDB更新の分岐を固定する。
 * 境界（prisma / storage / Fediverse投稿）はすべてモックする。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { findUnique, imageUpdate, getImage, postImageToFediverse } = vi.hoisted(
  () => ({
    findUnique: vi.fn(),
    imageUpdate: vi.fn(),
    getImage: vi.fn(),
    postImageToFediverse: vi.fn(),
  })
);

vi.mock("@/lib/db", () => ({
  default: { image: { findUnique, update: imageUpdate } },
}));

vi.mock("@/lib/storage/storage", () => ({
  getImage,
}));

// postImageToFediverse だけ差し替え（PublishUser 型など他は不要）。
vi.mock("@/lib/publish/publishImage", () => ({
  postImageToFediverse,
}));

import {
  isImageRepostable,
  repostImage,
  REPOST_MAX_AGE_MS,
} from "@/lib/publish/repostImage";

const NOW = new Date("2026-07-16T00:00:00.000Z").getTime();

const OWNER = {
  id: "user-1",
  username: "alice",
  accessToken: "token",
  instance: { domain: "mastodon.example", type: "mastodon" },
  autoMakeup: false,
};

function baseImage(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    storageKey: "2026/07/15/img.avif",
    mimeType: "image/avif",
    filename: "movapic-img.avif",
    overlayText: "本文",
    altText: "代替テキスト",
    postId: null,
    createdAt: new Date(NOW - 60 * 1000), // 1分前
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getImage.mockResolvedValue(Buffer.from("img"));
  postImageToFediverse.mockResolvedValue({
    success: true,
    postId: "s1",
    postUrl: "https://mastodon.example/@alice/s1",
  });
  imageUpdate.mockResolvedValue({});
});

describe("isImageRepostable", () => {
  it("未投稿かつ期間内なら true", () => {
    expect(
      isImageRepostable({ postId: null, createdAt: new Date(NOW - 1000) }, NOW)
    ).toBe(true);
  });

  it("既に投稿済み（postIdあり）なら false", () => {
    expect(
      isImageRepostable({ postId: "s1", createdAt: new Date(NOW - 1000) }, NOW)
    ).toBe(false);
  });

  it("期間（REPOST_MAX_AGE_MS）を過ぎたら false", () => {
    expect(
      isImageRepostable(
        { postId: null, createdAt: new Date(NOW - REPOST_MAX_AGE_MS - 1000) },
        NOW
      )
    ).toBe(false);
  });

  it("期間ちょうどは境界内として true", () => {
    expect(
      isImageRepostable(
        { postId: null, createdAt: new Date(NOW - REPOST_MAX_AGE_MS) },
        NOW
      )
    ).toBe(true);
  });
});

describe("repostImage", () => {
  const call = () =>
    repostImage({ imageId: "img", user: OWNER, visibility: "public", now: NOW });

  it("画像が存在しなければ not_found", async () => {
    findUnique.mockResolvedValue(null);
    expect(await call()).toEqual({ ok: false, failure: "not_found" });
    expect(postImageToFediverse).not.toHaveBeenCalled();
  });

  it("他人の画像なら forbidden", async () => {
    findUnique.mockResolvedValue(baseImage({ userId: "other" }));
    expect(await call()).toEqual({ ok: false, failure: "forbidden" });
    expect(postImageToFediverse).not.toHaveBeenCalled();
  });

  it("既に投稿済みなら already_posted", async () => {
    findUnique.mockResolvedValue(baseImage({ postId: "s1" }));
    expect(await call()).toEqual({ ok: false, failure: "already_posted" });
    expect(postImageToFediverse).not.toHaveBeenCalled();
  });

  it("期間を過ぎていたら too_old", async () => {
    findUnique.mockResolvedValue(
      baseImage({ createdAt: new Date(NOW - REPOST_MAX_AGE_MS - 1000) })
    );
    expect(await call()).toEqual({ ok: false, failure: "too_old" });
    expect(postImageToFediverse).not.toHaveBeenCalled();
  });

  it("S3に画像本体が無ければ no_image_data", async () => {
    findUnique.mockResolvedValue(baseImage());
    getImage.mockResolvedValue(null);
    expect(await call()).toEqual({ ok: false, failure: "no_image_data" });
    expect(postImageToFediverse).not.toHaveBeenCalled();
  });

  it("投稿成功なら postUrl/postId をUPDATEし ok:true を返す", async () => {
    findUnique.mockResolvedValue(baseImage());
    const result = await call();
    expect(postImageToFediverse).toHaveBeenCalledTimes(1);
    expect(imageUpdate).toHaveBeenCalledWith({
      where: { id: "img" },
      data: { postUrl: "https://mastodon.example/@alice/s1", postId: "s1" },
    });
    expect(result).toEqual({
      ok: true,
      postUrl: "https://mastodon.example/@alice/s1",
    });
  });

  it("保存済みのtext/altText/mimeTypeを投稿に渡す", async () => {
    findUnique.mockResolvedValue(baseImage());
    await call();
    const arg = postImageToFediverse.mock.calls[0][0];
    expect(arg.text).toBe("本文");
    expect(arg.altText).toBe("代替テキスト");
    expect(arg.contentType).toBe("image/avif");
    expect(arg.visibility).toBe("public");
  });

  it("投稿失敗ならDBを更新せず ok:true＋postError を返す（再挑戦可能なまま）", async () => {
    findUnique.mockResolvedValue(baseImage());
    postImageToFediverse.mockResolvedValue({
      success: false,
      error: "server error",
      statusCode: 503,
    });
    const result = await call();
    expect(imageUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      postError: "server error",
      postErrorStatus: 503,
    });
  });
});
