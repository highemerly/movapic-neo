/**
 * Graphile Worker のタスク定義
 *
 * 重い画像処理（processImage / publishImage）は worker プロセス側でのみ実行される。
 * producer（web/cron）はジョブを enqueue するだけ。
 */

import type { Task, TaskList } from "graphile-worker";
import { prisma } from "@/lib/db";
import { processImage } from "@/lib/imageProcessor";
import { publishImage, PublishVisibility } from "@/lib/publish/publishImage";
import { getImage, deleteImage } from "@/lib/storage/storage";
import { extractExif } from "@/lib/exif/parser";
import { reverseGeocode } from "@/lib/geocode/gsi";
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
    visibility: p.options.visibility,
    persistOnPostFailure: true,
    extras: { cameraMake, cameraModel, locationPrefecture, locationCity },
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
