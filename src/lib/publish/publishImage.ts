/**
 * 投稿パイプラインの共通処理
 *
 * web経由(/api/v1/post) / mail経由(/api/v1/ingest/email) / bot経由(mention/processor)
 * の3経路で重複していた「保存→サムネ→メタ→DB保存→Fediverse投稿」を一本化する。
 *
 * 順序は全経路で「保存 → 投稿 → postUrl を記録」（投稿に失敗しても画像は残り、再投稿でやり直せる）。
 * visibility→プラットフォームマッピング、Mastodon/Misskey分岐、isPublic、DBフィールドもここに集約する。
 *
 * pitfall: 以前は Bot（mention）だけ「先に投稿 → 成功時のみ保存」だった。投稿後に保存が失敗すると
 * リンク切れの投稿が残り、Bot の「もう一度メンションして」の案内やジョブの自動やり直しで二重投稿になった。
 * Bot のやり直しで画像が増えないことは、recordWithImage（保存と同じトランザクションで処理済みを確定）で守る。
 */

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
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
import { resolveUploadFormat } from "@/lib/fediverse/uploadFormat";
import { transcodeToJpeg } from "@/lib/compute/client";
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
import { assignMakeupForNewPost } from "@/lib/achievements/makeupAssign";
import { perfectMonthGrace } from "@/lib/achievements/grace";
import { toJstYm } from "@/lib/jst";
import { isPointEra } from "@/lib/makeup/points";
import { userPathSegment } from "@/lib/userHandle";
import { getHomeServer } from "@/lib/auth/serverPolicy";
import type { PostFacts } from "@/lib/achievements/catalog";
import type { ExifDetails } from "@/lib/exif/details";
import {
  resolveFediverseReplyTarget,
  type ReplyLink,
} from "@/lib/replies/fediverseTarget";
import { createReplyNotification } from "@/lib/notifications/replyNotifications";

// PublishVisibility は @/lib/visibility に集約。後方互換のため再エクスポートする。
export type { PublishVisibility } from "@/lib/visibility";

export interface PublishUser {
  id: string;
  username: string;
  /** 復号済みアクセストークン（呼び出し側で decryptToken 済み） */
  accessToken: string;
  instance: { domain: string; type: string };
  /**
   * カレンダーの自動穴埋め設定。true=投稿の瞬間にダブル投稿を過去の穴へ自動割当（既定）。
   * 2026-09 以前の月の投稿にだけ効く（2026-10 以降は穴埋めポイント制で手動のみ）。
   * TODO(cleanup-2026-10): docs/cleanup-2026-10.md 参照
   */
  autoMakeup: boolean;
}

export interface PublishImageInput {
  /** 生成済み（文字入れ済み）画像バッファ */
  buffer: Buffer;
  contentType: string;
  user: PublishUser;
  text: string;
  /**
   * 画像の代替テキスト（ALT）。null/undefined/空=未設定。
   * web=ユーザー入力 / mention=元投稿のメディア description を引き継ぎ / email=未対応。
   * Fediverse へは Mastodon=description・Misskey=comment(512字上限) として送り、
   * DB にも保存してサービス側 <img alt> のフォールバック元にする。
   */
  altText?: string | null;
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
   * リプライ（スレッド）先の画像ID。null/undefined=単独投稿。呼び出し側で可視性を検証済みであること
   * （web=findReplyableImage / 「連」=findLatestOwnImageId）。ミュートでは拒否しない。
   * 親も Fediverse に投稿されていれば、Fediverse 上でもスレッドに繋ぐ。docs/reply.md。
   */
  replyToImageId?: string | null;
  /**
   * 画像の DB 登録と同じトランザクションで実行する処理（任意）。
   * Bot は ProcessedMention をここで「処理済み」に確定させる。登録と別にすると、その間に
   * ジョブが例外で終わったとき、自動のやり直しが未処理と判断して2枚目を保存・投稿してしまう。
   */
  recordWithImage?: (tx: Prisma.TransactionClient) => Promise<unknown>;
  /** web専用の追加メタ（カメラ・位置情報） */
  extras?: {
    cameraMake?: string | null;
    cameraModel?: string | null;
    capturedAt?: Date | null;
    // 詳細撮影情報（cameraOption="detail" 時のみ）。ExifDetails の表示済み文字列 JSON。
    exifDetails?: ExifDetails | null;
    locationPrefecture?: string | null;
    locationCity?: string | null;
  };
  /**
   * 保存直前にだけ呼ばれ、サムネ（webp）と寸法を返す。
   * 呼び出し側が mime 判定のために既に finalize を叩いているので、その結果を使い回せるよう
   * コールバックで受ける（compute を二重に呼ばない）。投稿直前の形式変換のように
   * 呼び出し側が持っていない処理は、publishImage から compute クライアントを直接呼ぶ。
   * いずれも sharp は読み込まない（worker-front / web を native フリーに保つ）。
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
  /** 保存した画像ID（保存は投稿の成否に依存しない） */
  imageId: string;
  storageKey: string;
  imagePageUrl: string;
  postUrl?: string;
  postId?: string;
  /** 投稿に失敗した場合のエラー（保存自体は成否に依存しない） */
  postError?: string;
  /** 投稿失敗がサーバーのHTTPエラー応答だった場合のステータスコード（タイムアウト等では undefined） */
  postErrorStatus?: number;
  /** この投稿で新規獲得した実績（web投稿の演出・Bot のお知らせ用） */
  newAchievements?: GrantedAchievement[];
  /**
   * Fediverse への投稿は成功したが、リプライ先に繋げられず単独投稿になった（SHAMEZO 内では繋がっている）。
   * 親が local（そもそも連合していない）の場合は仕様どおりなので false。
   */
  threadBroken?: boolean;
}

/**
 * 保存された投稿から実績評価用の PostFacts を作る。
 * replyToId は実際に保存した値を受ける＝DB と一致させる。
 */
function toPostFacts(input: PublishImageInput, replyToId: string | null): PostFacts {
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
    isReply: replyToId != null,
    createdAt: new Date(),
  };
}

/**
 * リプライ通知を作る。保存・連合が済んだ後に例外を返すと、web はクライアントの再送・mention は
 * ジョブのリトライで二重投稿になるため、投稿処理を止めないようここで例外を握る。
 */
async function notifyReplySafely(
  input: PublishImageInput,
  imageId: string,
  replyToId: string | null
): Promise<void> {
  if (!replyToId) return;
  try {
    await createReplyNotification({
      replyImageId: imageId,
      replierUserId: input.user.id,
      parentImageId: replyToId,
    });
  } catch (error) {
    console.error("Reply notification failed:", error);
  }
}

/**
 * 保存が確定した後の処理（実績評価・リプライ通知）。保存後の処理はここ1箇所に足すこと。
 * pitfall: 以前は先保存／先投稿の2分岐があり、後処理を分岐ごとに書いて片方だけ漏れた（ALT で実例）。
 */
async function afterSaved(
  input: PublishImageInput,
  imageId: string,
  replyToId: string | null
): Promise<GrantedAchievement[]> {
  const newAchievements = await evaluateAchievementsSafely(input, imageId, replyToId);
  await notifyReplySafely(input, imageId, replyToId);
  return newAchievements;
}

/**
 * Fediverse 上でスレッドに繋げられなかったことを、利用者に知らせるべきか。
 * 親が連合していない（local・投稿失敗）／親が既に無いのは仕様どおり（表示しない）なので含めない。
 * 原因（返信先の削除・見つからない）は利用者には区別して見せず、logReply のログで追う。
 */
function isThreadBroken(link: ReplyLink | null, post: PostResult | null): boolean {
  if (!link || !post?.success) return false;
  if (post.replyDropped) return true;
  return link.kind === "shamezo-only" && (link.reason === "unresolved" || link.reason === "resolve-failed");
}

/**
 * 実績評価を行い、新規獲得を返す。投稿処理を絶対に止めないため、ここで全例外を握りつぶす。
 */
async function evaluateAchievementsSafely(
  input: PublishImageInput,
  imageId: string,
  replyToId: string | null
): Promise<GrantedAchievement[]> {
  try {
    // 自動穴埋め: 実績評価の「前」に割当を書き、書いた割当を含めて皆勤賞を判定させる。
    // autoMakeup=false のユーザーは投稿時に自動割当しない（カレンダー編集で明示指定した穴だけ埋まる）。
    // 2026-10 以降の月は穴埋めポイント制で全ユーザー手動のみ。投稿は必ず当月に入るので、
    // 2026-10-01 00:00 JST 以降この分岐には到達しない。
    // TODO(cleanup-2026-10): docs/cleanup-2026-10.md 参照（この分岐ごと削除）
    const now = new Date();
    if (!isPointEra(toJstYm(now)) && input.user.autoMakeup) {
      await assignMakeupForNewPost({
        userId: input.user.id,
        imageId,
        createdAt: now,
        grace: perfectMonthGrace(input.user.instance.domain),
      });
    }
    return await evaluateAndGrant({
      userId: input.user.id,
      post: toPostFacts(input, replyToId),
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
  /** 画像の代替テキスト（ALT）。未設定なら送らない。 */
  altText?: string | null;
  /** リプライ先の status / note ID（投稿者自身のインスタンス上）。未設定なら単独投稿。 */
  replyToPostId?: string | null;
}

/**
 * サービスの visibility をプラットフォーム別 visibility に変換して1回だけ投稿する。
 */
async function postImageOnce(input: PostImageInput): Promise<PostResult> {
  const {
    user,
    buffer,
    contentType,
    filename,
    text,
    imagePageUrl,
    visibility,
    altText,
    replyToPostId,
  } = input;

  // 空文字/空白のみは未設定として扱う（description/comment を送らない）
  const alt = altText?.trim() || undefined;

  const common = {
    server: user.instance.domain,
    accessToken: user.accessToken,
    imageBuffer: buffer,
    mimeType: contentType,
    filename,
    statusText: text,
    imageUrl: imagePageUrl,
    altText: alt,
    replyToId: replyToPostId,
  };

  if (user.instance.type === "mastodon") {
    return postToMastodon({ ...common, visibility: toMastodonVisibility(visibility) });
  }

  if (user.instance.type === "misskey") {
    // Misskey では unlisted が home に相当
    return postToMisskey({ ...common, visibility: toMisskeyVisibility(visibility) });
  }

  return { success: false, error: "サポートされていないプラットフォームです" };
}

/**
 * 投稿先に合わせて画像の形式を揃えた入力を返す。
 *
 * SHAMEZO の保存物は例外なく AVIF なので、AVIF を受け取れない Mastodon 向けにだけ
 * ここで JPEG へ変換する（変換結果は送信専用＝保存しない）。変換は sharp が要るため
 * compute に委譲する＝この関数を含め publishImage は native を読み込まない。
 */
async function toUploadPayload(input: PostImageInput): Promise<PostImageInput> {
  const format = resolveUploadFormat({
    instanceType: input.user.instance.type,
    contentType: input.contentType,
    filename: input.filename,
  });

  if (!format.transcodeTo) {
    return input;
  }

  const buffer = await transcodeToJpeg(input.buffer);
  return {
    ...input,
    buffer,
    contentType: format.contentType,
    filename: format.filename,
  };
}

/**
 * Fediverse へ1回だけ投稿する。失敗はそのまま返す（自動では再試行しない）。
 *
 * pitfall: 以前は 5xx/429 で同期的にもう1回投稿し直していた。本文作成（statuses / notes/create）は
 * 冪等でなく、サーバー側では作成済みなのに前段のプロキシが 502/504 を返すと二重投稿になる
 * （Misskey には Idempotency-Key 相当の仕組みが無い）。アップロードのやり直しも Misskey では
 * 利用者のドライブに重複ファイルを残す。429 は 1.5 秒待っても分単位のレート窓では回復しない。
 * 画像は先に保存されているので、やり直しは利用者が自分のタイムラインを確かめてから「再投稿」で行う。
 */
export async function postImageToFediverse(
  input: PostImageInput
): Promise<PostResult | null> {
  // local は連合しないので、形式変換（compute 往復）もせずに抜ける。
  if (input.visibility === "local") {
    return null;
  }

  // 保存物は常に AVIF だが Mastodon は AVIF を受け取れないため、ここで送信形式に変換する。
  let payload: PostImageInput;
  try {
    payload = await toUploadPayload(input);
  } catch (error) {
    console.error(
      `[fediverse] upload transcode failed: server=${input.user.instance.domain} ` +
        `contentType=${input.contentType} bytes=${input.buffer.length}`,
      error
    );
    // AVIF のまま送っても Mastodon 側で必ず 500 になるのでフォールバックしない。
    // 画像は保存済み（または mention なら再試行対象）なので、再投稿で復帰できる。
    return { success: false, error: "投稿用画像の変換に失敗しました" };
  }

  const result = await postImageOnce(payload);

  if (!result.success) {
    console.error(
      `[fediverse] post failed: server=${payload.user.instance.domain} type=${payload.user.instance.type} ` +
        `status=${result.statusCode ?? "-"} contentType=${payload.contentType} bytes=${payload.buffer.length} ` +
        `error=${result.error}`
    );
  }

  return result;
}

function buildImagePageUrl(username: string, domain: string, imageId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return `${appUrl}/u/${userPathSegment(username, domain, getHomeServer())}/status/${imageId}`;
}

/**
 * 画像をS3へ保存し、サムネイルを生成し、DBにImageレコードを作成する。
 * Fediverse投稿は行わない（postUrl/postId は投稿後に更新する）。
 */
async function storeAndRecord(
  input: PublishImageInput,
  imageId: string,
  replyToId: string | null
): Promise<{ imagePageUrl: string; storageKey: string }> {
  const extension = getExtensionFromMimeType(input.contentType);
  const storageKey = generateStorageKey(imageId, extension);
  const filename = `movapic-${imageId}.${extension}`;

  // 本体をS3へ
  await uploadImage(input.buffer, storageKey, input.contentType);

  // サムネ＋寸法は compute から取得（保存直前にだけ呼ぶ）→ S3へ
  const thumbnailKey = generateThumbnailKey(storageKey);
  const { thumbnail, width, height, blurDataUrl } =
    await input.getThumbnailAndDimensions();
  await uploadImage(thumbnail, thumbnailKey, "image/webp");

  await prisma.$transaction(async (tx) => {
    await tx.image.create({
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
        altText: input.altText?.trim() || null,
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
        cameraMake: input.extras?.cameraMake ?? null,
        cameraModel: input.extras?.cameraModel ?? null,
        capturedAt: input.extras?.capturedAt ?? null,
        // ExifDetails は固定キーの型のため Prisma の InputJsonValue（要 index signature）に
        // 直接は代入できない。表示済み文字列の平坦なオブジェクトなのでキャストで通す。
        exifDetails:
          (input.extras?.exifDetails as Prisma.InputJsonValue | undefined) ??
          undefined,
        locationPrefecture: input.extras?.locationPrefecture ?? null,
        locationCity: input.extras?.locationCity ?? null,
        replyToId,
      },
    });
    await input.recordWithImage?.(tx);
  });

  return {
    imagePageUrl: buildImagePageUrl(input.user.username, input.user.instance.domain, imageId),
    storageKey,
  };
}

/**
 * 投稿パイプライン本体。先に保存 → 投稿 → postUrl を更新（投稿失敗でも画像は残る）。
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

  // 投稿入力はここで1回だけ組む（以前の2分岐時代、分岐ごとに組んで片方だけ ALT が漏れた）。
  const basePost: PostImageInput = {
    user: input.user,
    buffer: input.buffer,
    contentType: input.contentType,
    filename,
    text: input.text,
    imagePageUrl,
    visibility: input.visibility,
    altText: input.altText,
  };

  // リプライ先を投稿者のサーバー上の ID に解決する。local は連合しないので解決しない。
  const replyToImageId = input.replyToImageId ?? null;
  const resolveReply = async (): Promise<ReplyLink | null> =>
    replyToImageId && !isLocal
      ? resolveFediverseReplyTarget({
          replyToImageId,
          viewer: {
            domain: input.user.instance.domain,
            type: input.user.instance.type,
            accessToken: input.user.accessToken,
          },
        })
      : null;
  const replyToPostIdOf = (link: ReplyLink | null) =>
    link?.kind === "linked" ? link.postId : null;
  const logReply = (link: ReplyLink | null, post: PostResult | null) => {
    if (!isThreadBroken(link, post)) return;
    console.warn(
      `[reply] posted without thread: image=${imageId} parent=${replyToImageId} ` +
        `server=${input.user.instance.domain} link=${JSON.stringify(link)} replyDropped=${!!post?.replyDropped}`
    );
  };

  // 先に保存（投稿失敗でも画像を残す。local は投稿しない）。
  // リプライ先の解決（最大 REPLY_RESOLVE_TIMEOUT_MS）は保存と並行させ、同期 /api/v1/post の
  // 応答時間（Ingress の504）に上乗せしない。解決は throw しないので保存の例外伝播は変わらない。
  const [{ storageKey }, replyLink] = await Promise.all([
    storeAndRecord(input, imageId, replyToImageId),
    resolveReply(),
  ]);

  const postResult = await postImageToFediverse({
    ...basePost,
    replyToPostId: replyToPostIdOf(replyLink),
  });

  if (postResult?.success && postResult.postUrl) {
    await prisma.image.update({
      where: { id: imageId },
      data: { postUrl: postResult.postUrl, postId: postResult.postId },
    });
  }
  logReply(replyLink, postResult);

  // 画像は保存済み（投稿失敗でも残る）なので実績評価する
  const newAchievements = await afterSaved(input, imageId, replyToImageId);

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
    threadBroken: isThreadBroken(replyLink, postResult),
  };
}
