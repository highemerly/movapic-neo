import Link from "@/components/Link";
import { CalendarDays, Camera, MapPin, SmilePlus } from "lucide-react";
import { ThumbnailImage } from "@/components/gallery/ThumbnailImage";
import { PinOverlay } from "@/components/pin/PinOverlay";
import { FavoriterAvatars } from "@/components/user/FavoriterAvatars";

export interface ProfileFeedImage {
  id: string;
  storageKey: string;
  overlayText: string;
  altText: string | null;
  position: string;
  size: string;
  blurDataUrl: string | null;
  /** ISO 文字列 */
  createdAt: string;
  /** Fediverse投稿済みの印（postId）。null=未投稿(local)。 */
  postId: string | null;
  /** リアクション合計（連合＋SHAMEZO上のマージ済み） */
  favoriteCount: number;
  /** リアクションした人（アバター表示用・プロキシ済みURL） */
  reactors: { acct: string; label: string; avatarUrl: string | null; profileUrl: string | null }[];
  cameraModel: string | null;
  locationPrefecture: string | null;
  locationCity: string | null;
}

/**
 * 概要（ホーム）ページのフィード風カード。
 *
 * 画像詳細ページと同じ要素（コメント本文・投稿日・カメラ/位置・リアクションした人）を
 * 読み取り専用で1枚に凝縮する。右カラムは常に4行（本文／投稿日／カメラ・位置／リアクション）で、
 * 左のサムネイルはその高さいっぱいの正方形にタイルモードと同じクロップで敷き詰める。
 * リアクション情報は保存済みのキャッシュとDBから組み立てた値をそのまま使い、ここでは Fediverse へ
 * 再同期しない（詳細ページを開いたときに最新化される）。本文・カメラ/位置は幅超過時に右を「…」で省略。
 */
export function ProfileFeedCard({
  image,
  seg,
  publicUrl,
  isPinned = false,
}: {
  image: ProfileFeedImage;
  seg: string;
  publicUrl: string;
  isPinned?: boolean;
}) {
  // from=user-home で、詳細ページの「戻る」をホーム（概要）へ向ける。
  const href = `/u/${seg}/status/${image.id}?from=user-home`;
  const date = new Date(image.createdAt).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  return (
    <div className="rounded-lg border overflow-hidden">
      {/* items-stretch で左サムネイルが右カラム(4行)の高さいっぱいに伸びる。
          幅は固定（w-24）にして高さ方向へ stretch。aspect-square だと幅が中身依存で
          0 に潰れて画像が消えるため、幅を確定させたうえで正方形に近い枠を作る。 */}
      <div className="flex items-stretch">
        <Link href={href} className="relative w-24 shrink-0 self-stretch overflow-hidden md:w-36">
          <ThumbnailImage
            src={`${publicUrl}/${image.storageKey}`}
            alt={image.altText || image.overlayText}
            position={image.position}
            size={image.size}
            blurDataUrl={image.blurDataUrl}
            containerClassName="h-full w-full overflow-hidden"
          />
          <PinOverlay isPinned={isPinned} />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2 md:gap-1.5 md:px-4 md:py-3">
          {/* 1行目: コメント本文（超過は右を「…」で省略） */}
          <Link href={href} className="block">
            <p className="truncate text-sm leading-snug hover:underline">
              {image.overlayText || " "}
            </p>
          </Link>
          {/* 2行目: 投稿日 */}
          <p className="flex items-center gap-0.5 truncate text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {date}
          </p>
          {/* 3行目: カメラ機種＋撮影地（超過は右を「…」で省略・常に1行分の高さを確保） */}
          <p className="min-h-4 truncate text-xs text-muted-foreground">
            {image.cameraModel && (
              <span className="mr-2 whitespace-nowrap">
                <Camera className="mr-0.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                {image.cameraModel}
              </span>
            )}
            {image.locationPrefecture && (
              <span className="whitespace-nowrap">
                <MapPin className="mr-0.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                {image.locationPrefecture}
                {image.locationCity ?? ""}
              </span>
            )}
          </p>
          {/* 4行目: リアクション合計＋リアクションした人（上位のみ・はみ出しは切り取り）。
              0件のときはアイコンだけ浮かないよう何も出さない（min-h-5 で行高は確保）。 */}
          <div className="flex min-h-5 items-center gap-1.5">
            {image.favoriteCount > 0 && (
              <>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <SmilePlus className="h-3.5 w-3.5" />
                  <span className="font-medium tabular-nums">{image.favoriteCount}</span>
                </span>
                {image.reactors.length > 0 && <FavoriterAvatars items={image.reactors} />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
