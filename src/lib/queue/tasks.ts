/**
 * Graphile Worker のタスク定義
 *
 * 重い画像処理（processImage / publishImage）は worker プロセス側でのみ実行される。
 * producer（web/cron）はジョブを enqueue するだけ。
 */

import type { Task, TaskList } from "graphile-worker";
import { prisma } from "@/lib/db";
import { renderImage, finalizeImage } from "@/lib/compute/client";
import { publishImage, PublishVisibility } from "@/lib/publish/publishImage";
import { getImage, deleteImage } from "@/lib/storage/storage";
import { extractExif } from "@/lib/exif/parser";
import { reverseGeocode } from "@/lib/geocode/gsi";
import { decryptToken } from "@/lib/auth/tokens";
import { processOneMention } from "@/lib/mention/processor";
import { getAdminAccts } from "@/lib/auth/admin";
import { sendBotDirectMessage } from "@/lib/bot/notify";
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
export const TASK_NOTIFY_REPORT = "notify-report";
export const TASK_DELETE_ACCOUNT = "delete-account";

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
    /** 公開範囲（件名コマンド > ユーザー設定 > public で解決済み） */
    visibility: PublishVisibility;
    /** カメラ機種を保存するか（件名コマンド > ユーザー設定で解決済み） */
    cameraOption: "none" | "show";
    /** 件名コマンドで指定された位置情報の保存範囲（none=保存しない） */
    locationOption: "none" | "pref" | "city";
  };
  /** producer が R2 一時領域にアップロードした元画像のキー */
  sourceStorageKey: string;
  sourceContentType: string;
}

export interface NotifyReportPayload {
  reportId: string;
}

export interface DeleteAccountPayload {
  /** 削除済みユーザーのID（ログ用。enqueue 時点で DB からは既に削除済み） */
  userId: string;
  /** R2 から削除する全オブジェクトキー（出力画像＋サムネイル） */
  storageKeys: string[];
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

  // 元画像からEXIFを抽出し、解決済みオプションに応じて撮影情報を保存する。
  // cameraOption / locationOption は parser で「件名コマンド > ユーザー設定」を解決済み。
  // - カメラ機種: cameraOption が "show" のときだけ Make/Model を保存（Web投稿と同方針）
  // - 撮影場所:   locationOption が pref/city のときだけ GPS から逆引きして保存
  const wantCamera = p.options.cameraOption === "show";
  const wantLocation = p.options.locationOption !== "none";

  let cameraMake: string | null = null;
  let cameraModel: string | null = null;
  let locationPrefecture: string | null = null;
  let locationCity: string | null = null;

  if (wantCamera || wantLocation) {
    const exif = await extractExif(sourceBuffer);
    if (wantCamera) {
      cameraMake = exif.cameraMake?.slice(0, 100) ?? null;
      cameraModel = exif.cameraModel?.slice(0, 100) ?? null;
    }
    if (wantLocation && exif.gpsLatitude != null && exif.gpsLongitude != null) {
      // GPS座標自体は保存せず、逆ジオコーディングした都道府県/市区町村のみ保存する（Web投稿と同方針）
      const geo = await reverseGeocode(exif.gpsLatitude, exif.gpsLongitude);
      if (geo) {
        locationPrefecture = geo.prefecture;
        if (p.options.locationOption === "city") {
          locationCity = geo.city;
        }
      }
    }
  }

  // 文字入れは compute へ委譲（worker は sharp/skia を呼ばない）
  const result = await renderImage({
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
    visibility: p.options.visibility,
    persistOnPostFailure: true,
    getThumbnailAndDimensions: async () => {
      const f = await finalizeImage(result.buffer, p.options.position);
      return { thumbnail: f.thumbnail, width: f.width, height: f.height };
    },
    extras: { cameraMake, cameraModel, locationPrefecture, locationCity },
  });

  // 成功時のみ一時画像を削除（失敗時はリトライで再利用するため残す）
  await deleteImage(p.sourceStorageKey).catch((e) =>
    console.error(`[process-email] 一時画像の削除に失敗: ${p.sourceStorageKey}`, e)
  );
};

/**
 * 通報の管理者通知。
 * 通報1件ごとに、管理者 acct 宛へ Bot から direct で「新しい通報」を知らせる。
 * 対応は管理者が /admin/reports で行う（この通知では何も画像に起きない）。
 */
const notifyReportTask: Task = async (payload) => {
  const { reportId } = payload as NotifyReportPayload;

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { reason: true },
  });

  // 通報が既に削除済み（画像削除に伴う cascade など）なら何もしない
  if (!report) return;

  const accts = getAdminAccts();
  if (accts.length === 0) {
    console.warn("[notify-report] 管理者(ADMIN_ACCTS)未設定のため通知をスキップ");
    return;
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const reportsUrl = `${appUrl}/admin/reports`;

  const message = [
    "🚩 新しい通報があります",
    `理由: ${report.reason}`,
    `一覧: ${reportsUrl}`,
  ].join("\n");

  await sendBotDirectMessage(accts, message);
};

/**
 * アカウント削除に伴う Object Storage（R2）の後始末。
 * DB のユーザー削除は API リクエスト側で同期的に完了済み（カスケードで関連行も消える）。
 * 遅いのは R2 オブジェクトの逐次削除なので、その部分だけをこのジョブに逃がす。
 * 既に存在しないキーや R2 一時障害は致命的ではないため、キー単位で握りつぶして続行する
 * （孤立オブジェクトが多少残ってもアカウント削除自体は成立済み）。
 */
const deleteAccountTask: Task = async (payload) => {
  const p = payload as DeleteAccountPayload;

  let deleted = 0;
  for (const key of p.storageKeys) {
    try {
      await deleteImage(key);
      deleted++;
    } catch (e) {
      console.error(`[delete-account] R2削除に失敗: ${key}`, e);
    }
  }

  console.log(
    `[delete-account] user=${p.userId} R2オブジェクト ${deleted}/${p.storageKeys.length} 件を削除`
  );
};

export const taskList: TaskList = {
  [TASK_PROCESS_MENTION]: processMentionTask,
  [TASK_PROCESS_EMAIL]: processEmailTask,
  [TASK_NOTIFY_REPORT]: notifyReportTask,
  [TASK_DELETE_ACCOUNT]: deleteAccountTask,
};
