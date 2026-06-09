/**
 * Graphile Worker のタスク定義
 *
 * 重い画像処理（processImage / publishImage）は worker プロセス側でのみ実行される。
 * producer（web/cron）はジョブを enqueue するだけ。
 */

import type { Task, TaskList } from "graphile-worker";
import { prisma } from "@/lib/db";
import { processImage } from "@/lib/imageProcessor";
import { publishImage } from "@/lib/publish/publishImage";
import { getImage, deleteImage } from "@/lib/storage/storage";
import { decryptToken } from "@/lib/auth/tokens";
import { processOneMention } from "@/lib/mention/processor";
import type { MastodonNotification } from "@/lib/mention/fetcher";
import type {
  Position,
  FontFamily,
  Color,
  Size,
  Arrangement,
  OutputFormat,
} from "@/types";

export const TASK_PROCESS_MENTION = "process-mention";
export const TASK_PROCESS_EMAIL = "process-email";

export interface ProcessMentionPayload {
  notification: MastodonNotification;
}

export interface ProcessEmailPayload {
  userId: string;
  text: string;
  options: {
    position: Position;
    font: FontFamily;
    color: Color;
    size: Size;
    arrangement: Arrangement;
  };
  /** producer が R2 一時領域にアップロードした元画像のキー */
  sourceStorageKey: string;
  sourceContentType: string;
}

/**
 * bot（メンション）投稿処理。
 * 冪等性・エラー通知・状態更新は processOneMention 内部で完結する。
 * processOneMention は想定内エラーを result で返す（throw しない）ため、
 * ここで throw されるのは DB 断などの想定外障害のみ → Graphile Worker のリトライ対象。
 */
const processMentionTask: Task = async (payload) => {
  const { notification } = payload as ProcessMentionPayload;
  await processOneMention(notification);
};

/**
 * mail 投稿処理。
 * producer が R2 一時領域に保存した元画像を取得し、文字入れ→保存→投稿する。
 */
const processEmailTask: Task = async (payload) => {
  const p = payload as ProcessEmailPayload;

  const user = await prisma.user.findUnique({
    where: { id: p.userId },
    include: { instance: true },
  });
  if (!user) {
    throw new Error(`[process-email] user not found: ${p.userId}`);
  }

  const sourceBuffer = await getImage(p.sourceStorageKey);
  if (!sourceBuffer) {
    throw new Error(`[process-email] source image not found: ${p.sourceStorageKey}`);
  }

  const outputFormat: OutputFormat =
    user.instance.type === "misskey" ? "misskey" : "mastodon";

  const result = await processImage({
    imageBuffer: sourceBuffer,
    text: p.text,
    position: p.options.position,
    color: p.options.color,
    size: p.options.size,
    font: p.options.font,
    output: outputFormat,
    arrangement: p.options.arrangement,
  });

  await publishImage({
    buffer: result.buffer,
    contentType: result.contentType,
    user: {
      id: user.id,
      username: user.username,
      accessToken: decryptToken(user.accessToken),
      instance: { domain: user.instance.domain, type: user.instance.type },
    },
    text: p.text,
    options: {
      position: p.options.position,
      font: p.options.font,
      color: p.options.color,
      size: p.options.size,
      outputFormat,
      arrangement: p.options.arrangement,
    },
    source: "email",
    visibility: "public",
    persistOnPostFailure: true,
  });

  // 成功時のみ一時画像を削除（失敗時はリトライで再利用するため残す）
  await deleteImage(p.sourceStorageKey).catch((e) =>
    console.error(`[process-email] 一時画像の削除に失敗: ${p.sourceStorageKey}`, e)
  );
};

export const taskList: TaskList = {
  [TASK_PROCESS_MENTION]: processMentionTask,
  [TASK_PROCESS_EMAIL]: processEmailTask,
};
