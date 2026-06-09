/**
 * 投稿パイプラインの共通処理
 *
 * web経由(/api/v1/post) / mail経由(/api/v1/email-generate) / bot経由(mention/processor)
 * の3経路で重複していた「保存→サムネ→メタ→DB保存→Fediverse投稿」を一本化する。
 *
 * 経路ごとに異なるのは「投稿失敗時に画像を保存するか（persistOnPostFailure）」の
 * ポリシーだけなので、それをフラグで切り替える。それ以外（visibility→プラットフォーム
 * マッピング、Mastodon/Misskey分岐、isPublic、DBフィールド）はここに集約する。
 */

import { randomUUID } from "crypto";
import sharp from "sharp";
import prisma from "@/lib/db";
import {
  uploadImage,
  generateStorageKey,
  getExtensionFromMimeType,
} from "@/lib/storage/storage";
import { generateThumbnail, generateThumbnailKey } from "@/lib/thumbnail";
import {
  postToMastodon,
  postToMisskey,
  MastodonVisibility,
  MisskeyVisibility,
  PostResult,
} from "@/lib/fediverse/post";
import {
  Position,
  FontFamily,
  Color,
  Size,
  OutputFormat,
  Arrangement,
} from "@/types";

/** サービス内の公開範囲（UI/DBと同じ値） */
export type PublishVisibility = "public" | "unlisted" | "local";

export interface PublishUser {
  id: string;
  username: string;
  /** 復号済みアクセストークン（呼び出し側で decryptToken 済み） */
  accessToken: string;
  instance: { domain: string; type: string };
}

export interface PublishImageInput {
  /** 生成済み（文字入れ済み）画像バッファ */
  buffer: Buffer;
  contentType: string;
  user: PublishUser;
  text: string;
  options: {
    position: Position;
    font: FontFamily;
    color: Color;
    size: Size;
    outputFormat: OutputFormat;
    arrangement: Arrangement;
  };
  source: "web" | "email" | "mention";
  visibility: PublishVisibility;
  /**
   * 投稿失敗時にも画像をDB保存するか。
   * - web/email: true（投稿が失敗してもサービス内には保存する）
   * - mention:   false（投稿が成功したときだけ保存し、失敗時はリトライさせる）
   */
  persistOnPostFailure: boolean;
  /** web専用の追加メタ（カメラ・位置情報） */
  extras?: {
    cameraMake?: string | null;
    cameraModel?: string | null;
    capturedAt?: Date | null;
    locationPrefecture?: string | null;
    locationCity?: string | null;
  };
  /** 呼び出し側が既に width/height を持っている場合に渡す（無ければ sharp で取得） */
  dimensions?: { width: number; height: number };
}

export interface PublishImageResult {
  /** 保存に成功した場合の画像ID（投稿失敗かつ persistOnPostFailure=false の場合は undefined） */
  imageId?: string;
  storageKey?: string;
  imagePageUrl?: string;
  postUrl?: string;
  postId?: string;
  /** 投稿に失敗した場合のエラー（保存自体は成否に依存しない） */
  postError?: string;
}

/**
 * サービスの visibility をプラットフォーム別 visibility に変換して投稿する。
 * local の場合は Fediverse 投稿しない（null を返す）。
 */
export async function postImageToFediverse(input: {
  user: PublishUser;
  buffer: Buffer;
  contentType: string;
  filename: string;
  text: string;
  imagePageUrl: string;
  visibility: PublishVisibility;
}): Promise<PostResult | null> {
  if (input.visibility === "local") {
    return null;
  }

  const { user, buffer, contentType, filename, text, imagePageUrl, visibility } =
    input;

  if (user.instance.type === "mastodon") {
    const v: MastodonVisibility = visibility === "unlisted" ? "unlisted" : "public";
    return postToMastodon(
      user.instance.domain,
      user.accessToken,
      buffer,
      contentType,
      filename,
      text,
      imagePageUrl,
      v
    );
  }

  if (user.instance.type === "misskey") {
    // Misskey では unlisted が home に相当
    const v: MisskeyVisibility = visibility === "unlisted" ? "home" : "public";
    return postToMisskey(
      user.instance.domain,
      user.accessToken,
      buffer,
      contentType,
      filename,
      text,
      imagePageUrl,
      v
    );
  }

  return { success: false, error: "サポートされていないプラットフォームです" };
}

function buildImagePageUrl(username: string, imageId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return `${appUrl}/u/${username}/status/${imageId}`;
}

/**
 * 画像をR2へ保存し、サムネイルを生成し、DBにImageレコードを作成する。
 * Fediverse投稿は行わない（postUrl/postId は引数で受け取り保存する）。
 */
async function storeAndRecord(
  input: PublishImageInput,
  imageId: string,
  postUrl?: string,
  postId?: string
): Promise<{ imagePageUrl: string; storageKey: string }> {
  const extension = getExtensionFromMimeType(input.contentType);
  const storageKey = generateStorageKey(imageId, extension);
  const filename = `movapic-${imageId}.${extension}`;

  // 本体をR2へ
  await uploadImage(input.buffer, storageKey, input.contentType);

  // サムネイル生成 → R2へ
  const thumbnailKey = generateThumbnailKey(storageKey);
  const thumbnailBuffer = await generateThumbnail(
    input.buffer,
    input.options.position
  );
  await uploadImage(thumbnailBuffer, thumbnailKey, "image/webp");

  // 寸法（呼び出し側が持っていればそれを使う）
  let width = input.dimensions?.width;
  let height = input.dimensions?.height;
  if (width == null || height == null) {
    const metadata = await sharp(input.buffer).metadata();
    width = metadata.width || 0;
    height = metadata.height || 0;
  }

  await prisma.image.create({
    data: {
      id: imageId,
      userId: input.user.id,
      storageKey,
      filename,
      mimeType: input.contentType,
      fileSize: input.buffer.length,
      width,
      height,
      overlayText: input.text,
      position: input.options.position,
      font: input.options.font,
      color: input.options.color,
      size: input.options.size,
      outputFormat: input.options.outputFormat,
      arrangement: input.options.arrangement,
      thumbnailKey,
      source: input.source,
      // 仕様: public / unlisted / local いずれも公開TLに表示する（CLAUDE.md）
      isPublic: true,
      postUrl,
      postId,
      cameraMake: input.extras?.cameraMake ?? null,
      cameraModel: input.extras?.cameraModel ?? null,
      capturedAt: input.extras?.capturedAt ?? null,
      locationPrefecture: input.extras?.locationPrefecture ?? null,
      locationCity: input.extras?.locationCity ?? null,
    },
  });

  return {
    imagePageUrl: buildImagePageUrl(input.user.username, imageId),
    storageKey,
  };
}

/**
 * 投稿パイプライン本体。
 *
 * persistOnPostFailure により、保存と投稿の順序を切り替える:
 * - true  (web/email): 先に保存 → 投稿 → postUrl を更新（投稿失敗でも画像は残る）
 * - false (mention):   先に投稿 → 成功時のみ保存（失敗時は何も残さずリトライ可能）
 *
 * local の場合は投稿せず保存のみ。
 */
export async function publishImage(
  input: PublishImageInput
): Promise<PublishImageResult> {
  const imageId = randomUUID();
  const extension = getExtensionFromMimeType(input.contentType);
  const filename = `movapic-${imageId}.${extension}`;
  const imagePageUrl = buildImagePageUrl(input.user.username, imageId);

  const isLocal = input.visibility === "local";

  if (input.persistOnPostFailure || isLocal) {
    // 先に保存（投稿失敗でも画像を残すポリシー、または local で投稿しない）
    const { storageKey } = await storeAndRecord(input, imageId);

    const postResult = await postImageToFediverse({
      user: input.user,
      buffer: input.buffer,
      contentType: input.contentType,
      filename,
      text: input.text,
      imagePageUrl,
      visibility: input.visibility,
    });

    if (postResult?.success && postResult.postUrl) {
      await prisma.image.update({
        where: { id: imageId },
        data: { postUrl: postResult.postUrl, postId: postResult.postId },
      });
    }

    return {
      imageId,
      storageKey,
      imagePageUrl,
      postUrl: postResult?.postUrl,
      postId: postResult?.postId,
      postError: postResult && !postResult.success ? postResult.error : undefined,
    };
  }

  // persistOnPostFailure=false かつ 非local: 投稿が成功したときだけ保存する
  const postResult = await postImageToFediverse({
    user: input.user,
    buffer: input.buffer,
    contentType: input.contentType,
    filename,
    text: input.text,
    imagePageUrl,
    visibility: input.visibility,
  });

  if (!postResult || !postResult.success) {
    return { postError: postResult?.error ?? "投稿に失敗しました" };
  }

  const { storageKey } = await storeAndRecord(
    input,
    imageId,
    postResult.postUrl,
    postResult.postId
  );

  return {
    imageId,
    storageKey,
    imagePageUrl,
    postUrl: postResult.postUrl,
    postId: postResult.postId,
  };
}
