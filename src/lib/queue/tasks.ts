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
import type { ExifDetails } from "@/lib/exif/details";
import { reverseGeocode } from "@/lib/geocode/gsi";
import { decryptToken } from "@/lib/auth/tokens";
import { processOneMention } from "@/lib/mention/processor";
import { syncFavoriteCache } from "@/lib/fediverse/favoriteSync";
import { runPeriodicJobs } from "@/lib/periodic";
import { getAdminAccts } from "@/lib/auth/admin";
import { sendBotDirectMessage } from "@/lib/bot/notify";
import type { MastodonNotification } from "@/lib/mention/fetcher";
import {
  DEFAULT_ARRANGEMENT,
  type Position,
  type FontFamily,
  type Color,
  type Size,
  type Arrangement,
  type OutputFormat,
  type CameraOption,
} from "@/types";
import { getSeasonByKey } from "@/lib/seasons/catalog";

export const TASK_PROCESS_MENTION = "process-mention";
export const TASK_PROCESS_EMAIL = "process-email";
export const TASK_NOTIFY_REPORT = "notify-report";
export const TASK_DELETE_ACCOUNT = "delete-account";
export const TASK_SYNC_FAVORITE = "sync-favorite";
export const TASK_PERIODIC = "periodic";

/**
 * お気に入り操作後の遅延 sync の各遅延（秒。「前回からの追加秒数」）。
 *
 * オーナー側 Fediverse の favourited_by に viewer 自身が載るのは federation 遅延で数秒後。
 * POST/DELETE 時の即時 sync で反映しきれなかったとき（連合が遅い別インスタンス等）だけ、この
 * ジョブを段階的な遅延で走らせ、反映が確認できたら早期終了する。即時→5s→30s（遅延は最大2回・
 * 操作から最長 ~35秒）で打ち切り、以降は通常の TTL / 定期 sync に委ねる。sleep で待たず runAt に
 * 逃がすので、待機中はワーカーの同時実行スロットを占有しない。
 */
export const FAVORITE_SYNC_DELAYS_SEC = [5, 30];

export interface SyncFavoritePayload {
  imageId: string;
  /** 操作した viewer の acct（username@domain）。反映確認に使う。 */
  viewerAcct: string;
  /** true=お気に入り（viewer が現れるまで）／false=解除（viewer が消えるまで）待つ */
  favourited: boolean;
  /** 0起点の試行回数（FAVORITE_SYNC_DELAYS_SEC のインデックス）。 */
  attempt: number;
}

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
    /** シーズン（期間限定）キー。producer が受信時刻で解決済み。null=通常投稿 */
    season: string | null;
    /** 公開範囲（件名コマンド > ユーザー設定 > public で解決済み） */
    visibility: PublishVisibility;
    /** カメラ機種を保存するか（件名コマンド > ユーザー設定で解決済み）。detail=撮影設定も保存 */
    cameraOption: CameraOption;
    /** 件名コマンドで指定された位置情報の保存範囲（none=保存しない） */
    locationOption: "none" | "pref" | "city";
  };
  /** producer が S3 一時領域にアップロードした元画像のキー */
  sourceStorageKey: string;
  sourceContentType: string;
}

export interface NotifyReportPayload {
  reportId: string;
}

export interface DeleteAccountPayload {
  /** 削除済みユーザーのID（ログ用。enqueue 時点で DB からは既に削除済み） */
  userId: string;
  /** S3 から削除する全オブジェクトキー（出力画像＋サムネイル） */
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
 * producer が S3 一時領域に保存した元画像を取得し、文字入れ→保存→投稿する。
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
  // - カメラ機種: cameraOption が "show"/"detail" のとき Make/Model を保存（Web投稿と同方針）
  // - 撮影設定: cameraOption が "detail" のときだけ F値・SS 等の詳細も保存
  // - 撮影場所:   locationOption が pref/city のときだけ GPS から逆引きして保存
  const wantDetail = p.options.cameraOption === "detail";
  const wantCamera = p.options.cameraOption === "show" || wantDetail;
  const wantLocation = p.options.locationOption !== "none";

  let cameraMake: string | null = null;
  let cameraModel: string | null = null;
  let exifDetails: ExifDetails | null = null;
  let locationPrefecture: string | null = null;
  let locationCity: string | null = null;

  if (wantCamera || wantLocation) {
    const exif = await extractExif(sourceBuffer, { detail: wantDetail });
    if (wantCamera) {
      cameraMake = exif.cameraMake?.slice(0, 100) ?? null;
      cameraModel = exif.cameraModel?.slice(0, 100) ?? null;
    }
    if (wantDetail) {
      exifDetails = exif.details;
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

  // シーズン（期間限定）: セット時はサムネのクロップ位置をプリセット位置に合わせ、
  // 案B（完全隔離）でDBのスタイル列には中立デフォルトを保存する。
  const seasonDef = p.options.season ? getSeasonByKey(p.options.season) : undefined;
  const cropPosition: Position = seasonDef ? seasonDef.preset.position : p.options.position;

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
    season: p.options.season,
  });

  await publishImage({
    buffer: result.buffer,
    contentType: result.contentType,
    user: {
      id: user.id,
      username: user.username,
      accessToken: decryptToken(user.accessToken),
      instance: { domain: user.instance.domain, type: user.instance.type },
      autoMakeup: user.autoMakeup,
    },
    text: p.text,
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
          position: p.options.position,
          font: p.options.font,
          color: p.options.color,
          size: p.options.size,
          outputFormat,
          arrangement: p.options.arrangement,
          season: null,
        },
    source: "email",
    visibility: p.options.visibility,
    persistOnPostFailure: true,
    getThumbnailAndDimensions: async () => {
      const f = await finalizeImage(result.buffer, cropPosition);
      return { thumbnail: f.thumbnail, width: f.width, height: f.height, blurDataUrl: f.blurDataUrl };
    },
    extras: { cameraMake, cameraModel, exifDetails, locationPrefecture, locationCity },
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
 * アカウント削除に伴う Object Storage（S3）の後始末。
 * DB のユーザー削除は API リクエスト側で同期的に完了済み（カスケードで関連行も消える）。
 * 遅いのは S3 オブジェクトの逐次削除なので、その部分だけをこのジョブに逃がす。
 * 既に存在しないキーや S3 一時障害は致命的ではないため、キー単位で握りつぶして続行する
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
      console.error(`[delete-account] S3削除に失敗: ${key}`, e);
    }
  }

  console.log(
    `[delete-account] user=${p.userId} S3オブジェクト ${deleted}/${p.storageKeys.length} 件を削除`
  );
};

/**
 * お気に入り操作後の遅延 sync（federation 遅延を吸収する早期終了つきチェーン）。
 * オーナー側キャッシュ・通知を正しく更新し、viewer の操作が反映されたら打ち切る。
 * 詳細な意図は FAVORITE_SYNC_DELAYS_SEC の doc 参照。
 */
const syncFavoriteTask: Task = async (payload, helpers) => {
  const p = payload as SyncFavoritePayload;

  const image = await prisma.image.findUnique({
    where: { id: p.imageId },
    include: { user: { include: { instance: true } } },
  });
  // 画像が消えた/非公開化/未投稿(local)になった等はもう追わない
  if (!image || !image.isPublic || image.isDisabled || !image.postId) return;

  const synced = await syncFavoriteCache(image);

  // viewer の操作がオーナー側に反映されたか（fav→出現／unfav→消滅）。反映済みなら打ち切り。
  const present = synced.favoriters.some((f) => f.acct === p.viewerAcct);
  const reflected = p.favourited ? present : !present;
  if (reflected) return;

  // 未反映。次の試行があれば段階遅延で積み直す（await sleep で待つとワーカースロットを
  // 占有してしまうため、必ず runAt に逃がして即 return する）。
  const next = p.attempt + 1;
  if (next >= FAVORITE_SYNC_DELAYS_SEC.length) return; // 打ち切り（TTL/定期syncに委ねる）
  const nextPayload: SyncFavoritePayload = { ...p, attempt: next };
  await helpers.addJob(TASK_SYNC_FAVORITE, nextPayload, {
    runAt: new Date(Date.now() + FAVORITE_SYNC_DELAYS_SEC[next] * 1000),
    jobKey: `fav-sync:${p.imageId}`,
  });
};

/**
 * 定期メンテナンス（crontab で 30分ごとに enqueue される単一ディスパッチャ）。
 * メンション取りこぼし回収などの複数サブジョブを順に回す。各サブジョブの失敗は
 * runPeriodicJobs 内部で隔離されるため、ここで throw されるのは想定外障害のみ。
 */
const periodicTask: Task = async () => {
  await runPeriodicJobs();
};

export const taskList: TaskList = {
  [TASK_PROCESS_MENTION]: processMentionTask,
  [TASK_PROCESS_EMAIL]: processEmailTask,
  [TASK_NOTIFY_REPORT]: notifyReportTask,
  [TASK_DELETE_ACCOUNT]: deleteAccountTask,
  [TASK_SYNC_FAVORITE]: syncFavoriteTask,
  [TASK_PERIODIC]: periodicTask,
};
