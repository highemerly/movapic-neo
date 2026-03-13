/**
 * メンション処理のメインロジック
 */

import { randomUUID } from "crypto";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { processImage } from "@/lib/imageProcessor";
import { uploadImage, generateStorageKey } from "@/lib/storage/r2";
import { postToMastodon, MastodonVisibility } from "@/lib/fediverse/post";
import { decryptToken } from "@/lib/auth/tokens";
import { MastodonNotification } from "./fetcher";
import { parseMentionContent, formatOptionsSummary, ParsedMentionOptions } from "./parser";
import { OutputFormat, MAX_TEXT_LENGTH } from "@/types";
import { ErrorCodes } from "@/lib/errors";

const USER_AGENT = "movapic/1.0";
const REQUEST_TIMEOUT = 30000;
const MAX_RETRY_COUNT = 2;

// 環境変数
const getBotInstanceUrl = () => process.env.MASTODON_BOT_INSTANCE_URL || "https://handon.club";
const getBotAccessToken = () => process.env.MASTODON_BOT_ACCESS_TOKEN || "";
const getBotAcct = () => process.env.MASTODON_BOT_ACCT || "movapic";

export interface ProcessResult {
  statusId: string;
  success: boolean;
  skipped: boolean;
  error?: string;
  errorCode?: string;
}

interface UserWithInstance {
  id: string;
  username: string;
  accessToken: string;
  mentionVisibility: string;
  mentionKeep: boolean;
  instance: {
    domain: string;
    type: string;
  };
  defaults: {
    position: string | null;
    font: string | null;
    color: string | null;
    size: string | null;
  };
}

/**
 * Botからリプライを送信
 * @param inReplyToId 返信先のステータスID
 * @param replyToAcct 返信先ユーザーのacct（メンション用）
 * @param message メッセージ本文
 * @param visibility 公開範囲
 */
async function sendBotReply(
  inReplyToId: string,
  replyToAcct: string,
  message: string,
  visibility: MastodonVisibility
): Promise<void> {
  const instanceUrl = getBotInstanceUrl();
  const accessToken = getBotAccessToken();

  // メンションを含めてユーザーに通知が届くようにする
  const statusText = `@${replyToAcct} ${message}`;

  const response = await fetch(`${instanceUrl}/api/v1/statuses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      status: statusText,
      in_reply_to_id: inReplyToId,
      visibility,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[mention] Botリプライ失敗: ${response.status} ${error}`);
  }
}

/**
 * 画像をfetch
 */
async function fetchImage(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!response.ok) {
    throw new Error(`画像の取得に失敗しました: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * URIからオリジナルのステータスIDを抽出
 * 例: https://handon.club/users/username/statuses/123456 → 123456
 */
function extractStatusIdFromUri(uri: string): string | null {
  // Mastodon形式: https://instance/users/username/statuses/ID
  const mastodonMatch = uri.match(/\/statuses\/(\d+)$/);
  if (mastodonMatch) {
    return mastodonMatch[1];
  }
  return null;
}

/**
 * 元投稿を削除（ユーザーのトークンで、ユーザーのインスタンスから）
 */
async function deleteOriginalStatus(
  userInstanceDomain: string,
  accessToken: string,
  originalStatusId: string
): Promise<void> {
  const response = await fetch(`https://${userInstanceDomain}/api/v1/statuses/${originalStatusId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[mention] 元投稿削除失敗: ${response.status} ${error}`);
  }
}

/**
 * ユーザーをDBから検索
 * account.acctは handon.clubユーザーなら "username"、リモートなら "username@remote.server"
 */
async function findUserByAcct(acct: string, botInstanceDomain: string): Promise<UserWithInstance | null> {
  // acctに@が含まれていない場合はBotインスタンスのユーザー
  const atIndex = acct.indexOf("@");
  const username = atIndex === -1 ? acct : acct.substring(0, atIndex);
  const instanceDomain = atIndex === -1 ? botInstanceDomain : acct.substring(atIndex + 1);

  const user = await prisma.user.findFirst({
    where: {
      username: username,
      instance: {
        domain: instanceDomain,
      },
    },
    include: {
      instance: true,
    },
  });

  if (!user) {
    return null;
  }

  // 暗号化されたトークンを復号化
  let decryptedToken: string;
  try {
    decryptedToken = decryptToken(user.accessToken);
  } catch (error) {
    console.error(`[mention] トークン復号化失敗: userId=${user.id}`, error);
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    accessToken: decryptedToken,
    mentionVisibility: user.mentionVisibility ?? "public",
    mentionKeep: user.mentionKeep ?? false,
    instance: {
      domain: user.instance.domain,
      type: user.instance.type,
    },
    defaults: {
      position: user.defaultPosition,
      font: user.defaultFont,
      color: user.defaultColor,
      size: user.defaultSize,
    },
  };
}

/**
 * 出力形式を決定（ユーザーのインスタンスタイプに基づく）
 */
function determineOutputFormat(instanceType: string): OutputFormat {
  return instanceType === "misskey" ? "misskey" : "mastodon";
}

/**
 * DBのvisibility値をMastodon APIのvisibilityに変換
 */
function convertToMastodonVisibility(visibility: string): MastodonVisibility {
  // local の場合はFediverseに投稿しないので、ここでは public として扱う
  if (visibility === "local") {
    return "public";
  }
  if (visibility === "unlisted" || visibility === "private" || visibility === "direct") {
    return visibility;
  }
  return "public";
}

/**
 * 1件のメンションを処理
 */
export async function processOneMention(
  notification: MastodonNotification
): Promise<ProcessResult> {
  const statusId = notification.status!.id;
  const startTime = Date.now();
  let requestId: string | undefined;

  const botAcct = getBotAcct();
  const botInstanceUrl = getBotInstanceUrl();
  const botInstanceDomain = new URL(botInstanceUrl).hostname;
  const originalVisibility = notification.status!.visibility as MastodonVisibility;
  const replyToAcct = notification.account.acct; // リプライ先ユーザーのacct

  // STEP1: 冪等性・リトライチェック
  const existingMention = await prisma.processedMention.findUnique({
    where: { statusId },
  });

  if (existingMention) {
    if (existingMention.status === "success") {
      return { statusId, success: true, skipped: true };
    }
    if (existingMention.status === "failed") {
      return { statusId, success: false, skipped: true, error: "既に最終失敗としてマーク済み" };
    }
    // pending かつ retryCount >= MAX_RETRY_COUNT
    if (existingMention.retryCount >= MAX_RETRY_COUNT) {
      await prisma.processedMention.update({
        where: { statusId },
        data: { status: "failed" },
      });
      await sendBotReply(
        statusId,
        replyToAcct,
        `処理に繰り返し失敗したため、中止しました。${existingMention.errorCode ? ` (${existingMention.errorCode})` : ""}`,
        originalVisibility
      );
      return { statusId, success: false, skipped: false, error: "リトライ上限到達" };
    }
  } else {
    // 新規作成
    await prisma.processedMention.create({
      data: { statusId, status: "pending" },
    });
  }

  // エラーハンドリング用のヘルパー（ユーザー検索前のエラー用）
  const handleErrorBeforeUser = async (errorCode: string, errorMessage: string) => {
    await prisma.processedMention.update({
      where: { statusId },
      data: {
        retryCount: { increment: 1 },
        errorCode,
      },
    });
    await sendBotReply(statusId, replyToAcct, errorMessage, originalVisibility);
    return { statusId, success: false, skipped: false, error: errorMessage, errorCode };
  };

  // STEP2: ユーザー検索（コマンド解析より先に実行してデフォルト設定を取得）
  const user = await findUserByAcct(notification.account.acct, botInstanceDomain);
  if (!user) {
    return handleErrorBeforeUser(
      ErrorCodes.NOT_FOUND,
      "このサービスにアカウント登録されていません。サービスページでログインしてください。"
    );
  }

  // STEP3: コマンド解析（ユーザーのデフォルト設定を使用）
  const parsed = parseMentionContent(notification.status!.content, botAcct, user.defaults);
  const options: ParsedMentionOptions = parsed.options;
  const text = parsed.text;

  // エラーハンドリング用のヘルパー（ユーザー検索後のエラー用）
  const handleError = async (errorCode: string, errorMessage: string, withRequestId: boolean = false) => {
    await prisma.processedMention.update({
      where: { statusId },
      data: {
        retryCount: { increment: 1 },
        errorCode,
      },
    });
    const message = withRequestId && requestId
      ? `${errorMessage} (${requestId})`
      : errorMessage;
    await sendBotReply(statusId, replyToAcct, message, originalVisibility);
    return { statusId, success: false, skipped: false, error: errorMessage, errorCode };
  };

  // 実際に使用するvisibilityを決定（コマンド指定 > ユーザー設定）
  // ただし、コマンドでlocalは指定できない（public/unlistedのみ）
  const effectiveVisibility = options.visibility || user.mentionVisibility;

  // 実際に使用するkeepを決定（コマンド指定 > ユーザー設定）
  // options.keepはコマンドで[keep]指定時のみtrue、それ以外はユーザー設定を使用
  const effectiveKeep = options.keep || user.mentionKeep;

  // STEP3: debug開始通知（ユーザー情報取得後に実行）
  if (options.debug) {
    const optionsSummary = formatOptionsSummary(options, user.mentionVisibility);
    await sendBotReply(
      statusId,
      replyToAcct,
      `処理を開始しました\n${optionsSummary}`,
      originalVisibility
    );
  }

  // STEP5: バリデーション
  const mediaAttachments = notification.status!.media_attachments;
  if (mediaAttachments.length === 0) {
    return handleError(
      ErrorCodes.VALIDATION_REQUIRED,
      "画像が添付されていません。画像を1枚添付してください。"
    );
  }
  if (mediaAttachments.length > 1) {
    return handleError(
      ErrorCodes.VALIDATION_INVALID,
      "画像は1枚だけ添付してください。"
    );
  }
  if (mediaAttachments[0].type !== "image") {
    return handleError(
      ErrorCodes.VALIDATION_FILE_TYPE,
      "画像ファイルを添付してください。動画やGIFは対応していません。"
    );
  }
  if (!text || text.trim().length === 0) {
    return handleError(
      ErrorCodes.VALIDATION_REQUIRED,
      "テキストを入力してください。"
    );
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return handleError(
      ErrorCodes.VALIDATION_TOO_LONG,
      `テキストは${MAX_TEXT_LENGTH}文字以内で入力してください。`
    );
  }

  // request ID生成（STEP6以降のエラーで使用）
  requestId = randomUUID().substring(0, 8) + "-" + randomUUID().substring(0, 4);

  // STEP6: 画像fetch
  let imageBuffer: Buffer;
  try {
    imageBuffer = await fetchImage(mediaAttachments[0].url);
  } catch (error) {
    console.error(`[mention] 画像fetch失敗:`, error);
    return handleError(
      ErrorCodes.INTERNAL_ERROR,
      "画像の取得に失敗しました。",
      true
    );
  }

  // STEP7: 文字入れ
  const outputFormat = determineOutputFormat(user.instance.type);
  let processedImage: { buffer: Buffer; contentType: string; extension: string };
  try {
    processedImage = await processImage({
      imageBuffer,
      text,
      position: options.position,
      color: options.color,
      size: options.size,
      font: options.font,
      output: outputFormat,
      arrangement: options.arrangement,
      requestId,
    });
  } catch (error) {
    console.error(`[mention] 画像処理失敗:`, error);
    return handleError(
      ErrorCodes.IMAGE_PROCESS_FAILED,
      "画像の処理に失敗しました。",
      true
    );
  }

  // STEP8: R2にアップロード
  const imageId = randomUUID();
  const storageKey = generateStorageKey(imageId, processedImage.extension);
  try {
    await uploadImage(processedImage.buffer, storageKey, processedImage.contentType);
  } catch (error) {
    console.error(`[mention] R2アップロード失敗:`, error);
    return handleError(
      ErrorCodes.INTERNAL_ERROR,
      "画像の保存に失敗しました。",
      true
    );
  }

  // 画像ページURL（Web版と共通の形式）
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const imagePageUrl = `${appUrl}/u/${user.username}/status/${imageId}`;

  // STEP9: 再投稿（localの場合はスキップ）
  const postVisibility = convertToMastodonVisibility(effectiveVisibility);
  const shouldPostToFediverse = effectiveVisibility !== "local";
  let postResult;

  if (shouldPostToFediverse) {
    try {
      postResult = await postToMastodon(
        user.instance.domain,
        user.accessToken,
        processedImage.buffer,
        processedImage.contentType,
        `movapic-${imageId}.${processedImage.extension}`,
        text,
        imagePageUrl,
        postVisibility
      );
      if (!postResult.success) {
        throw new Error(postResult.error);
      }
    } catch (error) {
      console.error(`[mention] 再投稿失敗:`, error);
      return handleError(
        ErrorCodes.INTERNAL_ERROR,
        "投稿に失敗しました。",
        true
      );
    }
  }

  // STEP10: 元投稿削除（effectiveKeepがfalseの場合のみ）
  if (!effectiveKeep) {
    // URIからオリジナルのステータスIDを抽出
    const originalStatusId = extractStatusIdFromUri(notification.status!.uri);
    if (originalStatusId) {
      try {
        await deleteOriginalStatus(user.instance.domain, user.accessToken, originalStatusId);
      } catch (error) {
        console.error(`[mention] 元投稿削除失敗:`, error);
        // 元投稿削除失敗はログのみ、処理は続行
      }
    } else {
      console.warn(`[mention] URIからステータスIDを抽出できませんでした: ${notification.status!.uri}`);
    }
  }

  // STEP11: DB保存
  const metadata = await sharp(processedImage.buffer).metadata();
  await prisma.image.create({
    data: {
      id: imageId,
      userId: user.id,
      storageKey,
      filename: `movapic-${imageId}.${processedImage.extension}`,
      mimeType: processedImage.contentType,
      fileSize: processedImage.buffer.length,
      width: metadata.width || 0,
      height: metadata.height || 0,
      overlayText: text,
      position: options.position,
      font: options.font,
      color: options.color,
      size: options.size,
      outputFormat,
      arrangement: options.arrangement,
      source: "mention",
      isPublic: effectiveVisibility !== "local",
    },
  });

  // ProcessedMentionをsuccessに更新
  await prisma.processedMention.update({
    where: { statusId },
    data: { status: "success", errorCode: null },
  });

  // STEP12: debug完了通知
  if (options.debug) {
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    await sendBotReply(
      statusId,
      replyToAcct,
      `処理が完了しました (${requestId})\n処理時間: ${elapsedSeconds}秒`,
      originalVisibility
    );
  }

  console.log(`[mention] 処理完了: statusId=${statusId}, imageId=${imageId}, requestId=${requestId}`);

  return { statusId, success: true, skipped: false };
}
