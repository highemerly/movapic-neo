import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/Link";
import { getAvatarUrl } from "@/lib/avatar";
import { buildOgImage } from "@/lib/ogImage";
import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { DeleteLocationButton } from "./DeleteLocationButton";
import { ImageNavigation } from "./ImageNavigation";
import { FontLicenseBadge } from "./FontLicenseBadge";
import { hasEmoji, hasNonEmojiText } from "@/lib/text/grapheme";
import { ImageActionsMenu } from "./ImageActionsMenu";
import { MisskeyOpenButton } from "./MisskeyOpenButton";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { FavoriteButton } from "@/components/favorite/FavoriteButton";
import { RetryImage } from "@/components/gallery/RetryImage";
import { AltTextReveal } from "@/components/AltTextReveal";
import { BackLink } from "@/components/BackLink";
import { PageContainer } from "@/components/PageContainer";
import {
  classifyPostStatus,
  favoriteErrorMessage,
  type CachedFavoriter,
} from "@/lib/fediverse/favorite";
import { Footer } from "@/components/Footer";
import { parseUserHandle } from "@/lib/userHandle";
import { NewUserGuide } from "@/components/onboarding/NewUserGuide";
import { getAllowedServers } from "@/lib/auth/allowedServers";
import { ToastFlasher } from "@/components/ToastFlasher";
import { buildPostFlash } from "./postFlash";
import { AchievementCelebration } from "./AchievementCelebration";
import { EarnedAchievementChips } from "./EarnedAchievementChips";
import { PrefectureScrollLink } from "@/components/ScrollIntoViewOnSelect";
import { NativeShareButton } from "./NativeShareButton";
import { resolveAchievement } from "@/lib/achievements/catalog";
import { hasRecentPerfectAttendance } from "@/lib/achievements/lastMonthPerfect";
import { AttendanceCrown } from "@/components/user/AttendanceCrown";
import { MastodonIcon } from "@/components/icons/MastodonIcon";
import { MisskeyIcon } from "@/components/icons/MisskeyIcon";
import { PostSourceBadge } from "./PostSourceBadge";
import { User, CalendarDays, Camera, MapPin, Reply, Repeat2, Bookmark, Share2 } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username, imageId } = await params;

  const image = await prisma.image.findUnique({
    where: { id: imageId },
    select: {
      storageKey: true,
      overlayText: true,
      altText: true,
      mimeType: true,
      width: true,
      height: true,
      isPublic: true,
      isDisabled: true,
      user: { select: { username: true, displayName: true, blockCrawlers: true, instance: { select: { domain: true } } } },
    },
  });

  // 非公開・取り下げ・不存在・ハンドル（username@domain）不一致はデフォルト（noindex扱い）
  const { username: cleanUsername, domain } = parseUserHandle(username);
  if (
    !image ||
    !image.isPublic ||
    image.isDisabled ||
    image.user.username !== cleanUsername ||
    image.user.instance.domain !== domain
  ) {
    return { title: "画像が見つかりません", robots: { index: false } };
  }

  const publicUrl = (process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  const imageUrl = `${publicUrl}/${image.storageKey}`;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const pageUrl = `${appUrl}/u/${username}/status/${imageId}`;

  const title = image.overlayText;
  const authorName = image.user.displayName || image.user.username;
  const description = `${authorName} さんの投稿`;
  // OG/Twitterカードのタイトルは HTMLの <title>（＝「本文 - 投稿者名 | SHAMEZO」）に揃える。
  // X は og:site_name を表示しないため、カード上にサービス名を出すにはタイトルへ含める必要がある。
  const cardTitle = `${title} - ${authorName} | SHAMEZO`;

  // X はカード画像に AVIF 非対応。AVIF はメディアプロキシ（ogp モード）で WebP に変換して渡す。
  const ogImage = buildOgImage({
    url: imageUrl,
    mimeType: image.mimeType,
    alt: image.altText || image.overlayText,
    width: image.width,
    height: image.height,
  });

  return {
    // HTMLの <title> はテンプレート（%s | SHAMEZO）でサービス名が付くので本文＋投稿者名まで。
    title: `${title} - ${authorName}`,
    description,
    // 投稿者がクロール拒否中なら公開画像でも検索エンジンに noindex（AI Bot は robots.txt 側）
    ...(image.user.blockCrawlers ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type: "article",
      siteName: "SHAMEZO",
      locale: "ja_JP",
      title: cardTitle,
      description,
      url: pageUrl,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: cardTitle,
      description,
      images: [ogImage.url],
    },
  };
}

interface PageProps {
  params: Promise<{
    username: string;
    imageId: string;
  }>;
  searchParams: Promise<{
    from?: string;
    posted?: string;
    federr?: string;
    fedstatus?: string;
  }>;
}

export default async function ImageDetailPage({ params, searchParams }: PageProps) {
  const { username, imageId } = await params;
  const { from, posted, federr, fedstatus } = await searchParams;
  // from は遷移元タブを表す。カレンダー/地図からの遷移では "種別:状態" 形式で
  // 元の月・都道府県を載せ、戻る導線で復元する（例 "user-calendar:2026-5" / "user-map:東京都"）。
  // 最初の ":" のみで分割（都道府県名に ":" は含まれない）。
  const fromSep = (from ?? "").indexOf(":");
  const fromKind = fromSep === -1 ? (from ?? "") : from!.slice(0, fromSep);
  const fromState = fromSep === -1 ? "" : from!.slice(fromSep + 1);
  const isFromPublic = fromKind === "public";
  // 「同じサーバー」タブ由来なら fromState に絞り込みサーバー（instances, カンマ区切り）が入る。
  const publicInstances =
    isFromPublic && fromState
      ? fromState.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
  const isFromFavorite = fromKind === "favorite";
  const justPosted = posted === "1";
  // SHAMEZOへの保存は成功したが Fediverse 投稿だけ失敗したケース（部分的成功）
  const fediverseFailed = justPosted && federr === "1";
  // サーバーが返した HTTP ステータスコード（タイムアウト等では付かない）
  const fediverseErrorStatus = fedstatus ? Number(fedstatus) : undefined;

  // ログインユーザーを取得
  const currentUser = await getCurrentUser();

  // 画像を取得（ユーザー情報も含む）
  const image = await prisma.image.findUnique({
    where: { id: imageId },
    include: {
      user: {
        include: {
          instance: true,
        },
      },
    },
  });

  // 画像が見つからない、非公開、または管理者により取り下げられた場合
  if (!image || !image.isPublic || image.isDisabled) {
    notFound();
  }

  // ハンドル（username@domain）が一致しない場合
  const { username: cleanUsername, domain } = parseUserHandle(username);
  if (image.user.username !== cleanUsername || image.user.instance.domain !== domain) {
    notFound();
  }

  // 投稿者が直近（先月/今月）の皆勤賞を取っていればアバターに王冠を表示
  const posterPerfectAttendance = await hasRecentPerfectAttendance(image.user.id);

  // Bot投稿の表示・説明に使う Bot アカウント（例: dev01@handon.club）
  const botAcct = `${process.env.MASTODON_BOT_ACCT || "pic"}@${
    process.env.MASTODON_BOT_INSTANCE_DOMAIN || "handon.club"
  }`;

  // お気に入りキャッシュから初期表示データを算出
  // お気に入り可能 = Fediverseに投稿済み（postIdがある）投稿のみ（local投稿は対象外）
  const favoritable =
    (image.user.instance.type === "mastodon" ||
      image.user.instance.type === "misskey") &&
    !!image.postId;
  const cachedFavoriters =
    (image.favoritersCache as unknown as CachedFavoriter[] | null) ?? [];
  const viewerAcct = currentUser
    ? `${currentUser.username}@${currentUser.instance.domain}`
    : null;
  const isFavorited = viewerAcct
    ? cachedFavoriters.some((f) => f.acct === viewerAcct)
    : false;
  // 前回sync結果（postStatus）から現状の理由を復元
  const persistedReason = favoritable ? classifyPostStatus(image.postStatus) : null;
  const initialSyncError = favoriteErrorMessage(persistedReason);
  // 削除確定（404/410）が分かっている時はトグル不可
  const canFavorite =
    !!currentUser &&
    (currentUser.instance.type === "mastodon" ||
      currentUser.instance.type === "misskey") &&
    persistedReason !== "deleted";

  // 前後の画像を取得
  // 公開TLからの場合: 全ユーザーの公開画像を対象
  // ユーザーギャラリーからの場合: 同じユーザーの公開画像のみ
  const navigationSelect = {
    id: true,
    overlayText: true,
    thumbnailKey: true,
    storageKey: true,
    user: {
      select: {
        username: true,
        instance: { select: { domain: true } },
      },
    },
  };

  // 前後ナビの対象範囲を遷移元で切り替える。
  // - 公開（みんな/同じサーバー）: 全体、または該当サーバーに限定
  // - お気に入り: 閲覧者がお気に入りした投稿に限定（要ログイン）
  // - それ以外（ギャラリー等）: その投稿のユーザーに限定
  let navigationScope: Prisma.ImageWhereInput;
  if (isFromPublic) {
    navigationScope =
      publicInstances.length > 0
        ? { user: { instance: { domain: { in: publicInstances } } } }
        : {};
  } else if (isFromFavorite && currentUser) {
    navigationScope = {
      favoritersCache: {
        array_contains: [
          { acct: `${currentUser.username}@${currentUser.instance.domain}` },
        ] as Prisma.InputJsonValue,
      },
    };
  } else {
    navigationScope = { userId: image.userId };
  }

  const [prevImage, nextImage, earnedAchievementRows] = await Promise.all([
    // 前の画像（古い方向）
    prisma.image.findFirst({
      where: {
        ...navigationScope,
        isPublic: true,
        isDisabled: false,
        createdAt: { lt: image.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: navigationSelect,
    }),
    // 次の画像（新しい方向）
    prisma.image.findFirst({
      where: {
        ...navigationScope,
        isPublic: true,
        isDisabled: false,
        createdAt: { gt: image.createdAt },
      },
      orderBy: { createdAt: "asc" },
      select: navigationSelect,
    }),
    // この投稿がきっかけで獲得した実績（実績タブと同様、誰でも閲覧可）
    prisma.achievement.findMany({
      where: { imageId: image.id },
      orderBy: { grantedAt: "asc" },
      select: { key: true, category: true },
    }),
  ]);

  const earnedAchievements = earnedAchievementRows.map((a) =>
    resolveAchievement(a.key, a.category)
  );

  const publicUrl = (process.env.S3_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  const imageUrl = `${publicUrl}/${image.storageKey}`;

  // 自分の画像かどうか
  const isOwner = currentUser?.id === image.userId;

  // 「あなたのサーバーで開く」動線。閲覧者自身のサーバーで元投稿を解決して開き、
  // 返信・リノート・お気に入り等ができるようにする。条件は閲覧者がそのサーバーWebに
  // ログイン中であること。postUrl が無い local 投稿は非表示。
  // - Mastodon: authorize_interaction で uri を解決して即開ける（純正の返信ボタンもここに行き着く）。
  //   Mastodon 4.x で /interact/:id は削除済みのため、この方式が唯一。
  // - Misskey: authorize_interaction 相当が無いため、クリック時に ap/show 解決して
  //   /notes/{id} を開く（MisskeyOpenButton がオンデマンドで解決）。
  const mastodonReplyUrl =
    currentUser?.instance.type === "mastodon" && image.postUrl
      ? `https://${currentUser.instance.domain}/authorize_interaction?uri=${encodeURIComponent(image.postUrl)}`
      : null;
  const misskeyOpenPostUrl =
    currentUser?.instance.type === "misskey" && image.postUrl
      ? image.postUrl
      : null;
  // シェアボタン側のレイアウト切り替えに使う（インタラクションボタンが出るか）
  const hasInteractButton = !!mastodonReplyUrl || !!misskeyOpenPostUrl;

  // シェアリンク。本文はページの <title>（generateMetadata の「<投稿テキスト> - <投稿者名>」
  // ＋テンプレート %s | SHAMEZO ＝「<投稿テキスト> - <投稿者名> | SHAMEZO」）に揃える
  // ＋ページURL（OGカードで画像＋テキストが表示される）。
  // ログイン中は閲覧者自身のサーバーの /share?text=（Mastodon・Misskey両対応）の作文画面を開く。
  // 未ログインは閲覧者のサーバーが不明なので anypost.dev/share?t=（投稿先サーバーを選べる）へ。
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const pageUrl = `${appUrl}/u/${username}/status/${imageId}`;
  const shareAuthorName = image.user.displayName || image.user.username;
  const shareText = `${image.overlayText} - ${shareAuthorName} | SHAMEZO\n${pageUrl}`;
  const shareUrl = currentUser
    ? `https://${currentUser.instance.domain}/share?text=${encodeURIComponent(shareText)}`
    : `https://anypost.dev/share?t=${encodeURIComponent(shareText)}`;

  const formattedCreatedAt = new Date(image.createdAt).toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });

  // 「戻る」リンクの遷移先とラベル（遷移元タブを from クエリで区別）
  // displayName 未設定時は username にフォールバック。params の username は URL エンコード済み
  // （@ が %40 に化ける）ため、DB のクリーンな image.user.username を使う。
  const galleryName = image.user.displayName || image.user.username;

  // 投稿者の所属インスタンス種別に応じたアイコン（Misskey/Mastodon）
  const PosterInstanceIcon =
    image.user.instance.type === "misskey" ? MisskeyIcon : MastodonIcon;
  let backUrl = `/u/${username}`;
  let backLabel = `${galleryName} のギャラリーに戻る`;
  if (fromKind === "public") {
    if (publicInstances.length > 0) {
      // 「同じサーバー」タブ由来。instances 絞り込みを保って戻す。
      backUrl = `/public?instances=${encodeURIComponent(publicInstances.join(","))}`;
      backLabel = "同じサーバーの投稿一覧に戻る";
    } else {
      backUrl = "/public";
      backLabel = "みんなの投稿一覧に戻る";
    }
  } else if (fromKind === "favorite") {
    backUrl = "/favorite";
    backLabel = "お気に入りの投稿一覧に戻る";
  } else if (fromKind === "user-calendar") {
    // fromState = "YYYY-M"（CalendarView が埋め込む）。遷移元の月のカレンダーへ戻す。
    const [cy, cm] = fromState.split("-");
    const q =
      cy && cm
        ? `?year=${encodeURIComponent(cy)}&month=${encodeURIComponent(cm)}`
        : "";
    backUrl = `/u/${username}/calendar${q}`;
    backLabel = `${galleryName} のカレンダーに戻る`;
  } else if (fromKind === "user-map") {
    // fromState = 都道府県名。遷移元の絞り込み状態へ戻す。
    backUrl = `/u/${username}/map${fromState ? `?prefecture=${encodeURIComponent(fromState)}` : ""}`;
    backLabel = `${galleryName} の地図に戻る`;
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader user={currentUser ? { username: currentUser.username, instanceDomain: currentUser.instance.domain, avatarUrl: getAvatarUrl(currentUser.avatarUrl) } : null} />
      {justPosted && (
        <ToastFlasher
          flash={buildPostFlash({
            fediverseFailed,
            serverDomain: image.user.instance.domain,
            statusCode: fediverseErrorStatus,
          })}
          clearParams={["posted", "federr", "fedstatus"]}
        />
      )}
      {justPosted && <AchievementCelebration username={username} />}
      <PageContainer>
        {/* ヘッダー */}
        <BackLink href={backUrl}>{backLabel}</BackLink>

        {/* 画像。ALTがある場合は右下に「ALT」バッジを重ね、押すと画像下にALTテキストを展開。 */}
        <div className="mb-2">
          <AltTextReveal altText={image.altText}>
            <div className="rounded-lg overflow-hidden bg-muted">
              <RetryImage
                src={imageUrl}
                alt={image.altText || image.overlayText}
                loading="eager"
                aspectRatio={image.width / image.height}
                blurDataUrl={image.blurDataUrl}
                containerClassName="w-full"
                imgClassName="absolute inset-0 h-full w-full object-contain"
              />
            </div>
          </AltTextReveal>
        </div>

        {/* テキスト */}
        <div className="mb-2">
          <p className="text-base whitespace-pre-wrap break-words">{image.overlayText}</p>
        </div>

        {/* この投稿で獲得した実績（コメント直下。チップをクリックするとお祝いモーダルを開く） */}
        <EarnedAchievementChips achievements={earnedAchievements} username={username} />

        {/* EXIF情報（カメラ機種・撮影場所）。投稿者本人のみ撮影場所だけ削除可能。 */}
        {(image.cameraModel || image.locationPrefecture) && (
          <p className="mb-[5px] flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
            {image.cameraModel && (
              <span className="inline-flex items-center gap-[3px]">
                <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {image.cameraModel}
              </span>
            )}
            {image.locationPrefecture && (
              <span className="inline-flex items-center gap-1">
                <span className="inline-flex items-center gap-0.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <PrefectureScrollLink
                    href={`/u/${username}/map?prefecture=${encodeURIComponent(image.locationPrefecture)}`}
                    className="hover:underline"
                  >
                    {image.locationPrefecture}
                  </PrefectureScrollLink>
                  {image.locationCity ?? ""}
                </span>
                {isOwner && (
                  <DeleteLocationButton
                    imageId={imageId}
                    locationLabel={`${image.locationPrefecture}${image.locationCity ?? ""}`}
                  />
                )}
              </span>
            )}
          </p>
        )}

        {/* メタ情報（日時・ソース・設定） */}
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {image.postUrl ? (
              <a
                href={image.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {formattedCreatedAt}
              </a>
            ) : (
              formattedCreatedAt
            )}
          </span>
          <FontLicenseBadge
            font={image.font}
            hasEmoji={hasEmoji(image.overlayText)}
            hasNonEmojiText={hasNonEmojiText(image.overlayText)}
          />
          {/* 投稿ソース（Bot/メール）。Web投稿は既定なので非表示。クリックで投稿方法モーダル。 */}
          {image.source === "email" ? (
            <PostSourceBadge source="email" />
          ) : image.source === "mention" ? (
            <PostSourceBadge
              source="mention"
              instanceType={image.user.instance.type}
              botAcct={botAcct}
              position={image.position}
              color={image.color}
              size={image.size}
              font={image.font}
              arrangement={image.arrangement}
              text={image.overlayText}
            />
          ) : null}
        </div>

        {/* お気に入り（Fediverse連携：Mastodon=favourite / Misskey=リアクション） */}
        {favoritable ? (
          <div className="mt-[10px] flex items-center gap-2">
            <FavoriteButton
              imageId={imageId}
              initialCount={image.favoriteCount}
              initialIsFavorited={isFavorited}
              initialFavoriters={cachedFavoriters.map((f) => ({
                acct: f.acct,
                displayName: f.displayName,
                avatarUrl: getAvatarUrl(f.avatarUrl),
                profileUrl: f.profileUrl,
              }))}
              canFavorite={canFavorite}
              initialSyncError={initialSyncError}
              disabledReason={
                persistedReason === "deleted"
                  ? "この投稿は削除されているため操作できません"
                  : !currentUser
                    ? "ログインするとお気に入りできます"
                    : "お気に入りはMastodon・Misskeyアカウントで利用できます"
              }
            />
          </div>
        ) : null}

        {/* 返信・シェア・その他メニュー（ピン留め・削除・共有、将来の通報）。
            いずれもログインユーザー向けの操作なので、未ログイン時は行ごと描画しない。 */}
        {currentUser && (
          <div className="mt-[10px] flex items-center gap-1">
          {/* 返信ボタンが出るケースは横が窮屈になるので、両ボタンを2行＋小さめ文字にして
              320px 幅でも収める（高さは h-[40px] 固定のまま変えない）。 */}
            {mastodonReplyUrl && (
              <a
                href={mastodonReplyUrl}
                className="flex flex-auto items-center justify-center gap-1 h-[40px] px-1 border rounded-md transition-colors text-muted-foreground hover:text-foreground border-border"
                title="あなたのサーバーでこの投稿を開きます（返信・ブースト・ブックマーク・お気に入りができます）"
              >
                <span className="flex shrink-0 items-center gap-0.5">
                  <Reply className="h-4 w-4" />
                  <Repeat2 className="h-4 w-4" />
                  <Bookmark className="h-4 w-4" />
                </span>
                <span className="flex flex-col items-start leading-tight text-[10px] font-medium">
                  <span>あなたの</span>
                  <span>サーバーで開く</span>
                </span>
              </a>
            )}
            {misskeyOpenPostUrl && (
              <MisskeyOpenButton postUrl={misskeyOpenPostUrl} />
            )}
            {shareUrl && (
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-center gap-1.5 h-[40px] border rounded-md transition-colors text-muted-foreground hover:text-foreground border-border ${hasInteractButton ? "flex-auto px-1.5" : "flex-1 px-2.5"}`}
                title="あなたのサーバーで、このURLを投稿します"
              >
                <Share2 className="h-4 w-4 shrink-0" />
                {hasInteractButton ? (
                  <span className="flex flex-col items-start leading-tight text-[10px] font-medium">
                    <span>リンクを</span>
                    <span>投稿</span>
                  </span>
                ) : (
                  <span className="flex flex-col items-start leading-none">
                    <span className="text-xs font-medium whitespace-nowrap mt-0.5">リンクを投稿</span>
                  </span>
                )}
              </a>
            )}
            <NativeShareButton
              imageUrl={imageUrl}
              mimeType={image.mimeType}
              fileBaseName={`shamezo-${imageId}`}
              text={image.overlayText}
              url={pageUrl}
            />
            <ImageActionsMenu
              imageId={imageId}
              username={username}
              isOwner={isOwner}
              initialIsPinned={!!image.pinnedAt}
              canReport={!isOwner}
              options={{
                position: image.position,
                color: image.color,
                size: image.size,
                font: image.font,
                arrangement: image.arrangement,
                season: image.season,
              }}
              nativeShare={{
                imageUrl,
                mimeType: image.mimeType,
                fileBaseName: `shamezo-${imageId}`,
                text: image.overlayText,
                url: pageUrl,
              }}
            />
          </div>
        )}

        {/* 投稿者情報（王冠が頭上に出るぶん、王冠ありのときだけ上パディングを確保） */}
        <div
          className={`flex items-center gap-2 mt-3 px-3 pb-3 bg-muted rounded-lg ${
            posterPerfectAttendance ? "pt-5" : "pt-3"
          }`}
        >
          {image.user.avatarUrl && (
            <div className="relative shrink-0">
              <Link href={`/u/${username}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getAvatarUrl(image.user.avatarUrl) ?? image.user.avatarUrl}
                  alt={image.user.displayName || image.user.username}
                  className="w-10 h-10 rounded-full hover:opacity-80 transition-opacity"
                  loading="lazy"
                />
              </Link>
              {posterPerfectAttendance && <AttendanceCrown />}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <Link
              href={`/u/${username}`}
              className="block truncate text-sm font-semibold hover:underline"
            >
              {image.user.displayName || image.user.username}
            </Link>
            <a
              href={`https://${image.user.instance.domain}/@${image.user.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:underline truncate"
            >
              <PosterInstanceIcon className="w-3 h-3 shrink-0" />
              <span className="truncate">@{image.user.username}@{image.user.instance.domain}</span>
            </a>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Link
              href={`/u/${username}`}
              className="p-2.5 rounded-full hover:bg-background transition-colors"
              title="ユーザーページ"
            >
              <User className="w-5 h-5 text-muted-foreground" />
            </Link>
            <Link
              href={`/u/${username}/calendar`}
              className="p-2.5 rounded-full hover:bg-background transition-colors"
              title="カレンダー"
            >
              <CalendarDays className="w-5 h-5 text-muted-foreground" />
            </Link>
          </div>
        </div>

        {/* 前後の画像ナビゲーション */}
        <div className="mt-8">
          <ImageNavigation
            prevImage={prevImage}
            nextImage={nextImage}
            from={from}
            publicUrl={publicUrl}
          />
        </div>

        {/* 新規ユーザー向けガイド（SNSからの初回流入の受け皿） */}
        <NewUserGuide
          isLoggedIn={!!currentUser}
          allowedServers={getAllowedServers()}
        />

        <Footer />
      </PageContainer>
      {/* 非ログインユーザーには投稿FABを出さない（ガイドのログイン導線へ誘導） */}
    </div>
  );
}
