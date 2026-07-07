/**
 * 投稿パイプラインの共通処理
 *
 * web経由(/api/v1/post) / mail経由(/api/v1/ingest/email) / bot経由(mention/processor)
 * の3経路で重複していた「保存→サムネ→メタ→DB保存→Fediverse投稿」を一本化する。
 *
 * 経路ごとに異なるのは「投稿失敗時に画像を保存するか（persistOnPostFailure）」の
 * ポリシーだけなので、それをフラグで切り替える。それ以外（visibility→プラットフォーム
 * マッピング、Mastodon/Misskey分岐、isPublic、DBフィールド）はここに集約する。
 */

import { randomUUID } from "crypto";
import prisma from "@/lib/db";
import {
  uploadImage,
  generateStorageKey,
  generateThumbnailKey,
  getExtensionFromMimeType,
} from "@/lib/storage/storage";
import {
  postToMastodon,
  postToMisskey,
  PostResult,
} from "@/lib/fediverse/post";
import {
  type PublishVisibility,
  toMastodonVisibility,
  toMisskeyVisibility,
} from "@/lib/visibility";
import {
  Position,
  FontFamily,
  Color,
  Size,
  OutputFormat,
  Arrangement,
} from "@/types";
import { evaluateAndGrant, GrantedAchievement } from "@/lib/achievements/engine";
import { userPathSegment } from "@/lib/userHandle";
import type { PostFacts } from "@/lib/achievements/catalog";

// PublishVisibility は @/lib/visibility に集約。後方互換のため再エクスポートする。
export type { PublishVisibility } from "@/lib/visibility";

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
    /** シーズン（期間限定）キー。null=通常投稿。セット時は他スタイルは中立デフォルト。 */
    season?: string | null;
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
  /**
   * 保存直前にだけ呼ばれ、サムネ（webp）と寸法を返す。
   * compute(/api/internal/finalize) への委譲を内側に閉じ込めるためのコールバック。
   * publishImage 自身は sharp を読み込まない（worker-front を native フリーに保つ）。
   * mention（persistOnPostFailure:false）では投稿成功時のみ呼ばれる＝失敗時は compute を呼ばない。
   */
  getThumbnailAndDimensions: () => Promise<{
    thumbnail: Buffer;
    width: number;
    height: number;
    /** 一覧のBlurプレースホルダ用 LQIP（data URI）。生成失敗時は undefined/null */
    blurDataUrl?: string | null;
  }>;
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
  /** 投稿失敗がサーバーのHTTPエラー応答だった場合のステータスコード（タイムアウト等では undefined） */
  postErrorStatus?: number;
  /** この投稿で新規獲得した実績（web投稿の演出用。保存された場合のみ） */
  newAchievements?: GrantedAchievement[];
}

/** 保存された投稿から実績評価用の PostFacts を作る。 */
function toPostFacts(input: PublishImageInput): PostFacts {
  return {
    overlayText: input.text,
    position: input.options.position,
    font: input.options.font,
    color: input.options.color,
    size: input.options.size,
    arrangement: input.options.arrangement,
    season: input.options.season ?? null,
    source: input.source,
    cameraModel: input.extras?.cameraModel ?? null,
    locationPrefecture: input.extras?.locationPrefecture ?? null,
    visibility: input.visibility,
    createdAt: new Date(),
  };
}

/**
 * 実績評価を行い、新規獲得を返す。投稿処理を絶対に止めないため、ここで全例外を握りつぶす。
 */
async function evaluateAchievementsSafely(
  input: PublishImageInput,
  imageId: string
): Promise<GrantedAchievement[]> {
  try {
    return await evaluateAndGrant({
      userId: input.user.id,
      post: toPostFacts(input),
      imageId,
      instanceDomain: input.user.instance.domain,
    });
  } catch (error) {
    console.error("Achievement evaluation failed:", error);
    return [];
  }
}

interface PostImageInput {
  user: PublishUser;
  buffer: Buffer;
  contentType: string;
  filename: string;
  text: string;
  imagePageUrl: string;
  visibility: PublishVisibility;
}

/** 5xx 再試行前の軽いバックオフ */
const RETRY_BACKOFF_MS = 500;

/**
 * サービスの visibility をプラットフォーム別 visibility に変換して1回だけ投稿する。
 * local の場合は Fediverse 投稿しない（null を返す）。
 */
async function postImageOnce(input: PostImageInput): Promise<PostResult | null> {
  if (input.visibility === "local") {
    return null;
  }

  const { user, buffer, contentType, filename, text, imagePageUrl, visibility } =
    input;

  if (user.instance.type === "mastodon") {
    const v = toMastodonVisibility(visibility);
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
    const v = toMisskeyVisibility(visibility);
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

/**
 * Fediverse へ投稿する。サーバーが 5xx（一時的な過負荷・障害）を返したときだけ、
 * 同期でもう一度だけ再試行する。
 *
 * 5xx に限定する理由:
 * - timeout/接続失敗（statusCode undefined）は1回で最大30秒待つため、再試行すると
 *   /api/v1/post の応答が長引き Ingress の504に達するリスクが高い。5xxは即座に返るので軽い。
 * - 4xx（権限不足・バリデーション等）は再試行しても結果が変わらない。
 */
export async function postImageToFediverse(
  input: PostImageInput
): Promise<PostResult | null> {
  const first = await postImageOnce(input);

  if (first && !first.success && first.statusCode && first.statusCode >= 500) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    return postImageOnce(input);
  }

  return first;
}

function buildImagePageUrl(username: string, domain: string, imageId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return `${appUrl}/u/${userPathSegment(username, domain)}/status/${imageId}`;
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

  // サムネ＋寸法は compute から取得（保存直前にだけ呼ぶ）→ R2へ
  const thumbnailKey = generateThumbnailKey(storageKey);
  const { thumbnail, width, height, blurDataUrl } =
    await input.getThumbnailAndDimensions();
  await uploadImage(thumbnail, thumbnailKey, "image/webp");

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
      season: input.options.season ?? null,
      thumbnailKey,
      blurDataUrl: blurDataUrl ?? null,
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
    imagePageUrl: buildImagePageUrl(input.user.username, input.user.instance.domain, imageId),
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
  const imagePageUrl = buildImagePageUrl(input.user.username, input.user.instance.domain, imageId);

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

    // 画像は保存済み（投稿失敗でも残るポリシー）なので実績評価する
    const newAchievements = await evaluateAchievementsSafely(input, imageId);

    return {
      imageId,
      storageKey,
      imagePageUrl,
      postUrl: postResult?.postUrl,
      postId: postResult?.postId,
      postError: postResult && !postResult.success ? postResult.error : undefined,
      postErrorStatus:
        postResult && !postResult.success ? postResult.statusCode : undefined,
      newAchievements,
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
    return {
      postError: postResult?.error ?? "投稿に失敗しました",
      postErrorStatus: postResult?.statusCode,
    };
  }

  const { storageKey } = await storeAndRecord(
    input,
    imageId,
    postResult.postUrl,
    postResult.postId
  );

  // 投稿成功時のみ保存されるので、ここで実績評価する
  const newAchievements = await evaluateAchievementsSafely(input, imageId);

  return {
    imageId,
    storageKey,
    imagePageUrl,
    postUrl: postResult.postUrl,
    postId: postResult.postId,
    newAchievements,
  };
}
