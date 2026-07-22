"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal,
  Pin,
  Trash2,
  Flag,
  Share,
  Link2,
  ExternalLink,
  Reply,
  Repeat2,
  Bookmark,
  Camera,
  MapPinOff,
  Image as ImageIcon,
  Settings2,
  VolumeX,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  POSITION_LABELS,
  COLOR_LABELS,
  SIZE_LABELS,
  ARRANGEMENT_LABELS,
  VISIBILITY_LABELS,
  type Position,
  type Color,
  type Size,
  type Arrangement,
} from "@/types";
import { SegmentControl } from "@/components/SegmentControl";
import { Button } from "@/components/ui/button";
import { seasonLabel } from "@/lib/seasons/catalog";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { FontLicenseBadge } from "./FontLicenseBadge";

/** 再投稿ダイアログの公開範囲（local は連合しないので対象外）。 */
type RepostVisibility = "public" | "unlisted";
const REPOST_VISIBILITIES: RepostVisibility[] = ["public", "unlisted"];
import { MuteDialog } from "@/components/mute/MuteDialog";
import { showFlashToast } from "@/components/ToastFlasher";
import { buildPostFlash } from "./postFlash";
import { ReportDialog } from "./ReportDialog";
import { useNativeShare, type NativeShareParams } from "./useNativeShare";
import { ExifDetailDialog, type ExifDetailData } from "./ExifDetailDialog";
import { useMisskeyOpen } from "./useMisskeyOpen";
import { useDeleteLocation } from "./useDeleteLocation";

interface ImageActionsMenuProps {
  imageId: string;
  username: string;
  isOwner: boolean;
  initialIsPinned: boolean;
  /** 再投稿可能か（未投稿かつ保存から一定期間内）。表示は isOwner と AND する。 */
  repostable: boolean;
  /** 投稿先の連携サーバードメイン（ラベル・トースト・モーダルに表示）。 */
  instanceDomain: string;
  /** 再投稿ダイアログの公開範囲の初期値。 */
  defaultVisibility: RepostVisibility;
  /** 通報可能か（ログイン済み かつ 自分の画像でない） */
  canReport: boolean;
  /** このユーザーをミュート可能か（ログイン済み かつ 自分の画像でない）。 */
  canMute: boolean;
  /** 閲覧者が投稿者を既にミュート中か（文言・解除導線の出し分け）。 */
  isMuted: boolean;
  /** トリガー（ミートボール）に足すクラス（非ログイン時に狭い画面のみ表示する等） */
  triggerClassName?: string;
  /** ネイティブ共有（Web Share API 対応時のみメニューに出す）。行内ボタンとは別に常に出す。 */
  nativeShare?: NativeShareParams;
  /** 撮影情報（EXIF）。値があるときだけ「詳細情報を表示」を出す。 */
  exif?: ExifDetailData | null;
  /** 投稿主のサーバー上の元投稿URL（未投稿の local ではなし）。「投稿主のサーバーで開く」用。 */
  postUrl?: string | null;
  /** 「[あなたのサーバー名]で開く/にリンクを投稿」のラベルに出す閲覧者サーバー名。 */
  viewerServerName?: string | null;
  /** Mastodon 閲覧者向け authorize_interaction URL（あなたのサーバーで開く）。 */
  mastodonOpenUrl?: string | null;
  /** Misskey 閲覧者向け元投稿URL（クリック時に ap/show 解決して開く）。 */
  misskeyOpenPostUrl?: string | null;
  /** 閲覧者サーバーの /share 作文画面URL（あなたのサーバーにリンクを投稿）。 */
  shareLinkUrl?: string | null;
  /** 撮影場所の表示名（例: 千葉県流山市）。isOwner かつ位置情報ありのとき「位置情報を取り除く」を出す。 */
  locationLabel?: string | null;
  /** コメント合成オプション（メニュー→モーダルで確認）。 */
  options: {
    position: string;
    color: string;
    size: string;
    font: string;
    arrangement: string;
    /** シーズン（期間限定）キー。セット時は個別オプションの代わりにシーズン名のみ表示 */
    season?: string | null;
  };
  /**
   * 本文に絵文字を含むか。true のときコメント設定モーダルのフォント欄に絵文字フォント
   * （Noto Emoji）のライセンスバッジも並べ、詳細ページのメタ行と同じ導線を提供する。
   */
  hasEmoji?: boolean;
  /**
   * 本文に絵文字以外の文字を含むか。false（絵文字のみ）のときは本文フォントが描画に
   * 使われないため、フォント欄に本文フォントのバッジを出さない。
   */
  hasNonEmojiText?: boolean;
}

/**
 * 「あなたのサーバーで開く」の先頭アイコン。返信だけでなくリノート・お気に入りもできる導線
 * なので、行内ボタンと同じ3アイコン（返信/リノート/ブックマーク）で誤解を防ぐ。
 */
function InteractIcons() {
  // 1アイコン分の枠（size-4）に3アイコンを絶対配置で重ね、順番に1つずつ表示する。
  // こうすると幅は単一アイコンと同じになり、他の項目とラベル左端が揃う。動きで「返信だけでなく
  // リノート・ブックマークもできる」導線であることを示す。負のディレイ差で常に1枚だけ見える状態から始める。
  // 動きを抑える設定では先頭（返信）のみ静止表示（枠幅は同じなので揃いは保たれる）。
  const cycle =
    "absolute inset-0 size-4 animate-[interact-icon-cycle_3s_infinite] motion-reduce:animate-none";
  return (
    <span className="relative mr-2 inline-flex size-4 shrink-0">
      <Reply className={cycle} />
      <Repeat2
        className={`${cycle} [animation-delay:-1s] motion-reduce:opacity-0`}
      />
      <Bookmark
        className={`${cycle} [animation-delay:-2s] motion-reduce:opacity-0`}
      />
    </span>
  );
}

/**
 * 画像詳細ページの「その他」操作メニュー（ミートボール）。誰にでも表示する。
 * 項目は3グループに分ける（区切り線で分割）:
 *   1. 閲覧・共有系（コメント設定/EXIF/各サーバーで開く/リンク投稿/共有）— 誰でも
 *   2. 対他者（ミュート/通報）— ログイン済み かつ 非オーナー
 *   3. オーナー操作（再投稿/サムネ/位置削除/ピン/削除）— オーナーのみ
 * 2と3は互いに排他（!isOwner / isOwner）なので区切り線は1本で足りる。
 * 画面に専用ボタンがある項目（各サーバーで開く・リンク投稿・共有）も、メニューにも重複して出す。
 */
export function ImageActionsMenu({
  imageId,
  username,
  isOwner,
  initialIsPinned,
  repostable,
  instanceDomain,
  defaultVisibility,
  canReport,
  canMute,
  isMuted,
  triggerClassName,
  nativeShare,
  exif,
  postUrl,
  viewerServerName,
  mastodonOpenUrl,
  misskeyOpenPostUrl,
  shareLinkUrl,
  locationLabel,
  options,
  hasEmoji = false,
  hasNonEmojiText = true,
}: ImageActionsMenuProps) {
  const router = useRouter();
  const confirm = useConfirm();
  // フックは常に呼ぶ（nativeShare 未指定時はダミー値。visible 判定で出し分け）
  const native = useNativeShare(
    nativeShare ?? { imageUrl: "", mimeType: "", fileBaseName: "", text: "", url: "" }
  );
  // Misskey の「あなたのサーバーで開く」解決（該当しないときは呼ばれない）。
  const misskey = useMisskeyOpen(misskeyOpenPostUrl ?? "");
  // 位置情報の削除（オーナー かつ 位置情報ありのときのみ項目を出す）。
  const locationDelete = useDeleteLocation(imageId, locationLabel ?? "");
  const [isPinned, setIsPinned] = useState(initialIsPinned);
  const [isPinning, setIsPinning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSettingThumb, setIsSettingThumb] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [exifOpen, setExifOpen] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const [repostVisibility, setRepostVisibility] =
    useState<RepostVisibility>(defaultVisibility);
  const [isReposting, setIsReposting] = useState(false);
  // ラベル・トースト・モーダルに出す投稿先サーバー名（未取得時のみ汎称にフォールバック）。
  const serverName = instanceDomain || "連携サーバー";
  // 「あなたのサーバー」ラベル（未取得時のみ汎称）。
  const yourServer = viewerServerName || "あなたのサーバー";
  // 本文フォントか絵文字フォントの少なくとも一方が描画に使われるとき、コメント設定モーダルに
  // フォント欄（ライセンスバッジ）を出す。どちらも無い（＝本文なし）なら空行を避けて省く。
  const showFontRow = hasNonEmojiText || hasEmoji;
  // 詳細ページのメタ行と同じライセンス導線を、モーダルのフォント欄でも共有する。
  const fontBadges = (
    <FontLicenseBadge
      font={options.font}
      hasEmoji={hasEmoji}
      hasNonEmojiText={hasNonEmojiText}
    />
  );

  // グループ1（閲覧・共有系）の表示可否。コメント設定は無条件なので常に非空。
  const showExif = !!exif;
  const showAuthorOpen = !!postUrl;
  const showShareLink = !!shareLinkUrl;
  const showNativeShare = !!nativeShare && native.visible;
  // グループ2（対他者）とグループ3（オーナー）は排他。どちらか出るなら区切り線を1本引く。
  const showModGroup = canMute || canReport;
  const showSeparator = showModGroup || isOwner;

  // ① その日のカレンダーサムネイルにこの写真を指定する。
  const handleSetThumbnail = useCallback(async () => {
    if (isSettingThumb) return;
    setIsSettingThumb(true);
    try {
      const response = await fetch(`/api/v1/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarPicked: true }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "サムネイルの設定に失敗しました");
        return;
      }
      toast.success("この日のカレンダーサムネイルにしました");
    } catch (error) {
      console.error("Set thumbnail error:", error);
      toast.error("サムネイルの設定に失敗しました");
    } finally {
      setIsSettingThumb(false);
    }
  }, [imageId, isSettingThumb]);

  const handlePin = useCallback(async () => {
    if (isPinning) return;
    const wasPinned = isPinned;

    // Optimistic update
    setIsPinned(!wasPinned);
    setIsPinning(true);
    try {
      const response = await fetch(`/api/v1/images/${imageId}/pin`, {
        method: wasPinned ? "DELETE" : "POST",
      });

      if (!response.ok) {
        setIsPinned(wasPinned);
        const data = await response.json().catch(() => ({}));
        toast.error(data.error?.message ?? "ピン留めの操作に失敗しました");
        return;
      }

      toast.success(wasPinned ? "ピン留めを解除しました" : "ピン留めしました");
    } catch (error) {
      setIsPinned(wasPinned);
      console.error("Pin error:", error);
      toast.error("ピン留めの操作に失敗しました");
    } finally {
      setIsPinning(false);
    }
  }, [imageId, isPinning, isPinned]);

  const handleDelete = useCallback(async () => {
    if (
      !(await confirm({
        title: "画像を削除",
        description: "この画像を削除しますか？この操作は取り消せません。",
        confirmText: "削除する",
        destructive: true,
      }))
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/v1/images/${imageId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "削除に失敗しました");
      }

      // サービスからの削除は完了。連携先（Mastodon/Misskey）に投稿が残っている場合は、
      // 続けて「そちらも削除しますか？」を尋ねる。
      const data: {
        remoteStatus?: {
          statusId: string;
          statusUrl: string | null;
          platform: "mastodon" | "misskey";
        } | null;
      } = await response.json().catch(() => ({}));

      // 連携先も削除できたか（遷移先トーストを出すか）。サーバー名は serverName を使う。
      let deletedRemote = false;
      const remoteStatus = data.remoteStatus;
      if (remoteStatus) {
        const platformName =
          remoteStatus.platform === "misskey" ? "Misskey" : "Mastodon";
        // どのサーバーの投稿かを前面に出す（プラットフォーム名は補足として括弧書き）。
        const deleteRemote = await confirm({
          title: `${serverName}の投稿も削除`,
          description: `この画像は${serverName}（${platformName}）にも投稿されています。${serverName}の投稿も削除しますか？`,
          confirmText: `${serverName}からも削除`,
          cancelText: "残しておく",
          destructive: true,
        });

        if (deleteRemote) {
          try {
            const remoteResponse = await fetch(
              "/api/v1/fediverse/delete-status",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ statusId: remoteStatus.statusId }),
              }
            );
            if (!remoteResponse.ok) {
              const remoteData = await remoteResponse.json().catch(() => ({}));
              throw new Error(
                remoteData.error || `${platformName}投稿の削除に失敗しました`
              );
            }
            deletedRemote = true;
          } catch (error) {
            // サービス側の画像は既に削除済みなので、ここでは通知のみ
            toast.error(
              error instanceof Error
                ? error.message
                : `${platformName}投稿の削除に失敗しました`
            );
          }
        }
      }

      // 成功トーストは遷移先のユーザーページで表示する（投稿完了時と同じ方式）。
      // deleted=1 は local のみ削除、deleted=remote は連携先も削除（server にサーバー名を載せる）。
      router.push(
        deletedRemote
          ? `/u/${username}?deleted=remote&server=${encodeURIComponent(serverName)}`
          : `/u/${username}?deleted=1`
      );
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "削除に失敗しました");
      setIsDeleting(false);
    }
  }, [confirm, imageId, router, username, serverName]);

  const handleRepost = useCallback(async () => {
    if (isReposting) return;
    setIsReposting(true);
    try {
      const response = await fetch(`/api/v1/images/${imageId}/repost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: repostVisibility }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(data.error?.message ?? data.error ?? "投稿に失敗しました");
        return;
      }

      // 画像処理は成功したが連合投稿だけ失敗したケース。postId は未設定のままなので、
      // ダイアログを閉じずに再試行できる状態を保つ。
      // 連合投稿だけ失敗（部分的成功）。postId は未設定のまま＝ダイアログを閉じず再試行可能に。
      if (data.fediverseError) {
        showFlashToast(
          buildPostFlash({
            fediverseFailed: true,
            fediversePosted: false,
            serverDomain: serverName,
            statusCode: data.fediverseErrorStatus,
          })
        );
        return;
      }

      showFlashToast(
        buildPostFlash({
          fediverseFailed: false,
          fediversePosted: true,
          serverDomain: serverName,
        })
      );
      setRepostOpen(false);
      // postId が付き、メニュー項目が消えて投稿リンクが出る状態へ更新する。
      router.refresh();
    } catch (error) {
      console.error("Repost error:", error);
      toast.error("投稿に失敗しました");
    } finally {
      setIsReposting(false);
    }
  }, [imageId, isReposting, repostVisibility, router, serverName]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex shrink-0 items-center justify-center h-[40px] w-[40px] border rounded-md transition-colors text-muted-foreground hover:text-foreground border-border ${triggerClassName ?? ""}`}
          title="その他"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {/* --- グループ1: 閲覧・共有系（誰でも） --- */}
        <DropdownMenuItem
          onSelect={() => {
            // preventDefault しない＝選択でミートボールを閉じ、モーダルだけを開く。
            setOptionsOpen(true);
          }}
        >
          <Settings2 className="mr-2 h-4 w-4" />
          コメント設定を表示
        </DropdownMenuItem>
        {showExif && (
          <DropdownMenuItem
            onSelect={() => {
              setExifOpen(true);
            }}
          >
            <Camera className="mr-2 h-4 w-4" />
            詳細情報（EXIF）を表示
          </DropdownMenuItem>
        )}
        {/* 投稿主のサーバー上の元投稿を開く（外部リンク）。 */}
        {showAuthorOpen && (
          <DropdownMenuItem asChild>
            <a href={postUrl!} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              投稿主のサーバーで開く
            </a>
          </DropdownMenuItem>
        )}
        {/* あなたのサーバーで開く（Mastodon=リンク / Misskey=クリック時に解決）。 */}
        {mastodonOpenUrl && (
          <DropdownMenuItem asChild>
            <a href={mastodonOpenUrl} rel="noopener noreferrer">
              <InteractIcons />
              {yourServer}で開く
            </a>
          </DropdownMenuItem>
        )}
        {misskeyOpenPostUrl && (
          <DropdownMenuItem
            disabled={misskey.loading}
            onSelect={(e) => {
              e.preventDefault();
              misskey.open();
            }}
          >
            <InteractIcons />
            {yourServer}で開く
          </DropdownMenuItem>
        )}
        {/* あなたのサーバーにこのページのリンクを投稿（作文画面を開く）。 */}
        {showShareLink && (
          <DropdownMenuItem asChild>
            <a href={shareLinkUrl!} target="_blank" rel="noopener noreferrer">
              <Link2 className="mr-2 h-4 w-4" />
              リンクを投稿
            </a>
          </DropdownMenuItem>
        )}
        {/* ネイティブ共有（Web Share API 対応時のみ。行内ボタンとは別に常に出す）。 */}
        {showNativeShare && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              native.share();
            }}
          >
            <Share className="mr-2 h-4 w-4" />
            共有
          </DropdownMenuItem>
        )}

        {showSeparator && <DropdownMenuSeparator />}

        {/* --- グループ2: 対他者（ログイン済み かつ 非オーナー） --- */}
        {canMute && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setMuteOpen(true);
            }}
          >
            <VolumeX className="mr-2 h-4 w-4" />
            {isMuted ? "ミュートを変更・解除" : "このユーザーをミュート"}
          </DropdownMenuItem>
        )}
        {canReport && (
          <DropdownMenuItem
            className="text-red-600 focus:text-red-600"
            onSelect={(e) => {
              e.preventDefault();
              setReportOpen(true);
            }}
          >
            <Flag className="mr-2 h-4 w-4" />
            通報
          </DropdownMenuItem>
        )}

        {/* --- グループ3: オーナー操作 --- */}
        {isOwner && (
          <>
            {/* まだ Fediverse 未投稿（失敗/local）かつ保存から一定期間内のときだけ再投稿を出す。 */}
            {repostable && (
              <DropdownMenuItem
                disabled={isReposting}
                onSelect={(e) => {
                  e.preventDefault();
                  setRepostOpen(true);
                }}
              >
                <Send className="mr-2 h-4 w-4" />
                {serverName}に投稿
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled={isSettingThumb}
              onSelect={(e) => {
                e.preventDefault();
                handleSetThumbnail();
              }}
            >
              <ImageIcon className="mr-2 h-4 w-4" />
              この日のサムネイルにする
            </DropdownMenuItem>
            {/* 撮影場所（位置情報）を持つときだけ削除を出す。 */}
            {locationLabel && (
              <DropdownMenuItem
                disabled={locationDelete.deleting}
                onSelect={(e) => {
                  e.preventDefault();
                  locationDelete.remove();
                }}
              >
                <MapPinOff className="mr-2 h-4 w-4" />
                位置情報を取り除く
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled={isPinning}
              onSelect={(e) => {
                e.preventDefault();
                handlePin();
              }}
            >
              <Pin
                className={`mr-2 h-4 w-4 ${
                  isPinned ? "fill-current text-amber-500" : ""
                }`}
              />
              {isPinned ? "ピン留めを解除" : "ピン留め"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isDeleting}
              className="text-red-600 focus:text-red-600"
              onSelect={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              削除
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
      {canReport && (
        <ReportDialog
          imageId={imageId}
          open={reportOpen}
          onOpenChange={setReportOpen}
        />
      )}
      {canMute && (
        // username はこの画像ページのパスセグメント（`username` or `username@domain`）＝投稿者。
        // API はこれをハンドルとして解決する。
        <MuteDialog
          handle={username}
          alreadyMuted={isMuted}
          open={muteOpen}
          onOpenChange={setMuteOpen}
        />
      )}
      {exif && (
        <ExifDetailDialog
          cameraMake={exif.cameraMake}
          cameraModel={exif.cameraModel}
          details={exif.details}
          open={exifOpen}
          onOpenChange={setExifOpen}
        />
      )}
      <Dialog open={optionsOpen} onOpenChange={setOptionsOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 shrink-0" />
              コメント設定
            </DialogTitle>
            <DialogDescription className="text-left">
              コメント合成のオプションです。
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            {options.season ? (
              // シーズン（期間限定）投稿: スタイル列は中立デフォルトなので、シーズン名を示す。
              // 生成時のプリセットフォント（image.font）は保存されているため、期間限定アレンジで
              // 使われているフォントとしてバッジで表示し、ライセンスモーダルへ導線を通す。
              <>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">シーズン</dt>
                  <dd>{seasonLabel(options.season)}</dd>
                </div>
                {showFontRow && (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">フォント</dt>
                    <dd className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-right">
                      {fontBadges}
                    </dd>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">位置</dt>
                  <dd>
                    {POSITION_LABELS[options.position as Position] || options.position}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">色</dt>
                  <dd>{COLOR_LABELS[options.color as Color] || options.color}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">サイズ</dt>
                  <dd>{SIZE_LABELS[options.size as Size] || options.size}</dd>
                </div>
                {showFontRow && (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">フォント</dt>
                    <dd className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-right">
                      {fontBadges}
                    </dd>
                  </div>
                )}
                {options.arrangement !== "none" && (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">アレンジ</dt>
                    <dd>
                      {ARRANGEMENT_LABELS[options.arrangement as Arrangement] ||
                        options.arrangement}
                    </dd>
                  </div>
                )}
              </>
            )}
          </dl>
        </DialogContent>
      </Dialog>
      <Dialog open={repostOpen} onOpenChange={setRepostOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 shrink-0" />
              {serverName}に投稿
            </DialogTitle>
            <DialogDescription className="text-left">
              この画像を {serverName} へ投稿します。公開範囲を選んでください。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <SegmentControl
              value={repostVisibility}
              options={REPOST_VISIBILITIES}
              onChange={setRepostVisibility}
              disabled={isReposting}
              renderOption={(v) => VISIBILITY_LABELS[v]}
            />
            <Button
              onClick={handleRepost}
              disabled={isReposting}
              className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {isReposting ? "投稿中..." : "投稿する"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DropdownMenu>
  );
}
