/**
 * メンション処理のメインロジック
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { renderImage, finalizeImage } from "@/lib/compute/client";
import { publishImage, PublishVisibility } from "@/lib/publish/publishImage";
import { MastodonVisibility } from "@/lib/fediverse/post";
import { deleteFediverseStatus } from "@/lib/fediverse/delete";
import { decryptToken } from "@/lib/auth/tokens";
import { MastodonNotification } from "./fetcher";
import { parseMentionContent, formatOptionsSummary, ParsedMentionOptions } from "./parser";
import {
  OutputFormat,
  MAX_TEXT_LENGTH,
  DEFAULT_ARRANGEMENT,
  type Position,
} from "@/types";
import { countGraphemes } from "@/lib/text/grapheme";
import { getSeasonByKey } from "@/lib/seasons/catalog";
import { ErrorCodes } from "@/lib/errors";
import { USER_AGENT } from "@/lib/userAgent";
import { assertSafeRemoteUrl } from "@/lib/security/ssrf";
import { resolveAchievement } from "@/lib/achievements/catalog";
import { userPathSegment } from "@/lib/userHandle";

const REQUEST_TIMEOUT = 30000;
const MAX_RETRY_COUNT = 2;

// 環境変数
const getBotInstanceUrl = () => process.env.MASTODON_BOT_INSTANCE_URL || "https://handon.club";
const getBotInstanceDomain = () => process.env.MASTODON_BOT_INSTANCE_DOMAIN || "handon.club";
const getBotAccessToken = () => process.env.MASTODON_BOT_ACCESS_TOKEN || "";
const getBotAcct = () => process.env.MASTODON_BOT_ACCT || "pic";

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
  defaultVisibility: string;
  mentionKeep: boolean;
  autoMakeup: boolean;
  instance: {
    domain: string;
    type: string;
  };
  defaults: {
    position: string | null;
    font: string | null;
    color: string | null;
    size: string | null;
    arrangement: string | null;
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
    console.error(`[mention] Botリプライ失敗: ${response.status}`);
  }
}

/**
 * 画像をfetch
 *
 * media_attachments[].url は外部インスタンス由来の任意URLになりうるため、
 * fetch前に解決先IPを検証して内部アドレスへのSSRFを防ぐ。
 */
async function fetchImage(url: string): Promise<Buffer> {
  // 解決先IPが内部・予約済みアドレスでないことを検証（SSRF対策）
  const safeUrl = await assertSafeRemoteUrl(url);

  const response = await fetch(safeUrl, {
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
 * URIからオリジナルの投稿ID（Mastodon=statusId / Misskey=noteId）を抽出
 * 例（Mastodon）: https://handon.club/users/username/statuses/123456 → 123456
 * 例（Misskey）:  https://mi.hiyoko.club/notes/9abcdef → 9abcdef
 */
function extractStatusIdFromUri(uri: string, instanceType: string): string | null {
  if (instanceType === "misskey") {
    // Misskey形式: https://instance/notes/ID（IDは英数字）
    const misskeyMatch = uri.match(/\/notes\/([a-zA-Z0-9]+)\/?$/);
    return misskeyMatch ? misskeyMatch[1] : null;
  }
  // Mastodon形式: https://instance/users/username/statuses/ID
  const mastodonMatch = uri.match(/\/statuses\/(\d+)$/);
  return mastodonMatch ? mastodonMatch[1] : null;
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
    defaultVisibility: user.defaultVisibility ?? "public",
    mentionKeep: user.mentionKeep ?? false,
    autoMakeup: user.autoMakeup,
    instance: {
      domain: user.instance.domain,
      type: user.instance.type,
    },
    defaults: {
      position: user.defaultPosition,
      font: user.defaultFont,
      color: user.defaultColor,
      size: user.defaultSize,
      arrangement: user.defaultArrangement,
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
 * 1件のメンションを処理
 */
export async function processOneMention(
  notification: MastodonNotification
): Promise<ProcessResult> {
  const statusId = notification.status!.id;
  const startTime = Date.now();
  // eslint-disable-next-line prefer-const
  let requestId: string | undefined;

  const botAcct = getBotAcct();
  const botInstanceDomain = getBotInstanceDomain();
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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const loginLine = appUrl ? `\n${appUrl}` : "";
    return handleErrorBeforeUser(
      ErrorCodes.NOT_FOUND,
      `SHAMEZOにアカウント登録すると、Botにメンションするだけで画像に文字入れできます。下記ページからお使いのアカウントでログインしてご利用ください。${loginLine}`
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
      ? `${errorMessage}\n何度も同じエラーになる場合は、Request ID: ${requestId}を添えてお問い合わせください。`
      : errorMessage;
    await sendBotReply(statusId, replyToAcct, message, originalVisibility);
    return { statusId, success: false, skipped: false, error: errorMessage, errorCode };
  };

  // 実際に使用するvisibilityを決定（コマンド指定 > Webデフォルト設定 > public）
  // ただし、コマンドでlocalは指定できない（public/unlistedのみ）
  const effectiveVisibility = options.visibility || user.defaultVisibility;

  // 実際に使用するkeepを決定（コマンド指定 > ユーザー設定）
  // options.keepはコマンドで[keep]指定時のみtrue、それ以外はユーザー設定を使用
  const effectiveKeep = options.keep || user.mentionKeep;

  // STEP3: debug開始通知（ユーザー情報取得後に実行）
  if (options.debug) {
    const optionsSummary = formatOptionsSummary(options, user.defaultVisibility);
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
  if (countGraphemes(text) > MAX_TEXT_LENGTH) {
    return handleError(
      ErrorCodes.VALIDATION_TOO_LONG,
      `テキストは${MAX_TEXT_LENGTH}文字以内で入力してください。`
    );
  }
  // シーズン（期間限定）コマンドが指定されたが、受信時刻にアクティブなシーズンが無い場合はエラー。
  if (options.seasonRequested && !options.season) {
    return handleError(
      ErrorCodes.VALIDATION_INVALID,
      "現在利用できるシーズンがありません。"
    );
  }

  // シーズン時はサムネのクロップ位置をプリセット位置に合わせ、案B（完全隔離）で
  // DBのスタイル列には中立デフォルトを保存する。
  const seasonDef = options.season ? getSeasonByKey(options.season) : undefined;
  const cropPosition: Position = seasonDef ? seasonDef.preset.position : options.position;

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
      "画像の取得に失敗しました。再投稿してみてください。",
      true
    );
  }

  // STEP7: 文字入れ
  const outputFormat = determineOutputFormat(user.instance.type);
  let processedImage: { buffer: Buffer; contentType: string; extension: string };
  try {
    // 文字入れは compute へ委譲（worker は sharp/skia を呼ばない）
    processedImage = await renderImage({
      imageBuffer,
      text,
      position: options.position,
      color: options.color,
      size: options.size,
      font: options.font,
      output: outputFormat,
      arrangement: options.arrangement,
      season: options.season,
      requestId,
    });
  } catch (error) {
    console.error(`[mention] 画像処理失敗:`, error);
    return handleError(
      ErrorCodes.IMAGE_PROCESS_FAILED,
      "画像の処理に失敗しました。再投稿してみてください。",
      true
    );
  }

  // STEP8-11: 保存→投稿（共通パイプライン）。
  // mention は投稿成功時のみ保存し、失敗時はリトライさせる（persistOnPostFailure: false）。
  let published;
  try {
    published = await publishImage({
      buffer: processedImage.buffer,
      contentType: processedImage.contentType,
      user: {
        id: user.id,
        username: user.username,
        accessToken: user.accessToken, // findUserByAcct で復号済み
        instance: { domain: user.instance.domain, type: user.instance.type },
        autoMakeup: user.autoMakeup,
      },
      text,
      // ALTは元投稿の添付画像に設定されていた代替テキストをそのまま引き継ぐ（未設定なら null）。
      altText: mediaAttachments[0].description?.trim() || null,
      // 案B（実績は season:null で隔離）: season 指定時はスタイル列にプリセット実値を保存
      // （タイル表示のフォーカス/拡大率を実描画に一致させる）。
      options: seasonDef
        ? {
            position: seasonDef.preset.position,
            font: seasonDef.preset.font,
            color: seasonDef.preset.color,
            size: seasonDef.preset.size,
            outputFormat,
            arrangement: DEFAULT_ARRANGEMENT,
            season: seasonDef.key,
          }
        : {
            position: options.position,
            font: options.font,
            color: options.color,
            size: options.size,
            outputFormat,
            arrangement: options.arrangement,
            season: null,
          },
      source: "mention",
      visibility: effectiveVisibility as PublishVisibility,
      persistOnPostFailure: false,
      // 投稿成功時にだけ呼ばれる＝失敗時は compute(finalize)を呼ばない
      getThumbnailAndDimensions: async () => {
        const f = await finalizeImage(processedImage.buffer, cropPosition);
        return { thumbnail: f.thumbnail, width: f.width, height: f.height, blurDataUrl: f.blurDataUrl };
      },
    });
  } catch (error) {
    console.error(`[mention] 保存/投稿失敗:`, error);
    return handleError(ErrorCodes.INTERNAL_ERROR, "画像の保存に失敗しました。再投稿してみてください。", true);
  }

  if (published.postError) {
    console.error(`[mention] 再投稿失敗: ${published.postError}`);
    return handleError(ErrorCodes.INTERNAL_ERROR, "投稿に失敗しました。再投稿してみてください。", true);
  }

  const imageId = published.imageId;

  // STEP10: 元投稿削除（effectiveKeepがfalseの場合のみ）
  if (!effectiveKeep) {
    // URIからオリジナルの投稿ID（Mastodon=statusId / Misskey=noteId）を抽出
    const originalStatusId = extractStatusIdFromUri(
      notification.status!.uri,
      user.instance.type
    );
    if (originalStatusId) {
      try {
        // user.accessToken は findUserByAcct で復号済み
        await deleteFediverseStatus(
          user.instance.type,
          user.instance.domain,
          user.accessToken,
          originalStatusId
        );
      } catch (error) {
        console.error(`[mention] 元投稿削除失敗:`, error);
        // 元投稿削除失敗はログのみ、処理は続行
      }
    } else {
      console.warn(`[mention] URIから投稿IDを抽出できませんでした: ${notification.status!.uri}`);
    }
  }

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

  // STEP13: 実績獲得通知（この投稿で新規実績を獲得していればリプライでお知らせ）
  if (published.newAchievements && published.newAchievements.length > 0) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const seg = userPathSegment(user.username, user.instance.domain);
    const lines = published.newAchievements.map((a) => {
      const { title } = resolveAchievement(a.key, a.category);
      // celebrate=1 は「今まさに獲得した」演出を出すための専用フラグ
      const url = `${appUrl}/u/${seg}/achievements?a=${encodeURIComponent(a.key)}&celebrate=1`;
      return `🏆「${title}」\n${url}`;
    });
    const header =
      published.newAchievements.length === 1
        ? "この投稿で実績を獲得しました！"
        : `この投稿で実績を${published.newAchievements.length}個獲得しました！`;
    try {
      await sendBotReply(
        statusId,
        replyToAcct,
        `${header}\n${lines.join("\n")}`,
        originalVisibility
      );
    } catch (error) {
      // 通知失敗は本処理の成功を妨げない
      console.error(`[mention] 実績通知リプライ失敗:`, error);
    }
  }

  console.log(`[mention] 処理完了: statusId=${statusId}, imageId=${imageId}, requestId=${requestId}`);

  return { statusId, success: true, skipped: false };
}
