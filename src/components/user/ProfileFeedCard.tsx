import Link from "@/components/Link";
import { CalendarDays, Camera, MapPin, Heart } from "lucide-react";
import { ThumbnailImage } from "@/components/gallery/ThumbnailImage";
import { FavoriterAvatars } from "@/components/user/FavoriterAvatars";
import { getAvatarUrl } from "@/lib/avatar";
import type { CachedFavoriter } from "@/lib/fediverse/favorite";

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
  favoriteCount: number;
  favoriters: CachedFavoriter[];
  cameraModel: string | null;
  locationPrefecture: string | null;
  locationCity: string | null;
}

// お気に入りアバターは上位のみ描画し、はみ出しは overflow-hidden で切り取る（横スクロールしない）。
// 全体数は左のハート数字が表すので、ここでは並べられるだけ並べれば十分。
const MAX_FAVORITERS = 12;

/**
 * 概要（ホーム）ページのフィード風カード。
 *
 * 画像詳細ページと同じ要素（コメント本文・投稿日・カメラ/位置・お気に入りした人）を
 * 読み取り専用で1枚に凝縮する。右カラムは常に4行（本文／投稿日／カメラ・位置／お気に入り）で、
 * 左のサムネイルはその高さいっぱいの正方形にタイルモードと同じクロップで敷き詰める。
 * お気に入り情報は image.favoritersCache をそのまま使い、ここでは Fediverse へ再同期しない
 * （詳細ページを開いたときに最新化される）。本文・カメラ/位置は幅超過時に右を「…」で省略。
 */
export function ProfileFeedCard({
  image,
  seg,
  publicUrl,
}: {
  image: ProfileFeedImage;
  seg: string;
  publicUrl: string;
}) {
  // from=user-home で、詳細ページの「戻る」をホーム（概要）へ向ける。
  const href = `/u/${seg}/status/${image.id}?from=user-home`;
  const date = new Date(image.createdAt).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const favoriters = image.favoriters.slice(0, MAX_FAVORITERS).map((f) => ({
    acct: f.acct,
    label: f.displayName || f.acct,
    avatarUrl: getAvatarUrl(f.avatarUrl),
    profileUrl: f.profileUrl,
  }));

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* items-stretch で左サムネイルが右カラム(4行)の高さいっぱいに伸びる。
          幅は固定（w-24）にして高さ方向へ stretch。aspect-square だと幅が中身依存で
          0 に潰れて画像が消えるため、幅を確定させたうえで正方形に近い枠を作る。 */}
      <div className="flex items-stretch">
        <Link href={href} className="relative w-24 shrink-0 self-stretch overflow-hidden">
          <ThumbnailImage
            src={`${publicUrl}/${image.storageKey}`}
            alt={image.altText || image.overlayText}
            position={image.position}
            size={image.size}
            blurDataUrl={image.blurDataUrl}
            containerClassName="h-full w-full overflow-hidden"
          />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2">
          {/* 1行目: コメント本文（超過は右を「…」で省略） */}
          <Link href={href} className="block">
            <p className="truncate text-sm leading-snug hover:underline">
              {image.overlayText || " "}
            </p>
          </Link>
          {/* 2行目: 投稿日 */}
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
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
          {/* 4行目: お気に入り数＋お気に入りした人（上位のみ・はみ出しは切り取り） */}
          <div className="flex items-center gap-1.5">
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <Heart className="h-3.5 w-3.5 fill-current text-red-500" />
              <span className="font-medium tabular-nums">{image.favoriteCount}</span>
            </span>
            {favoriters.length > 0 && <FavoriterAvatars items={favoriters} />}
          </div>
        </div>
      </div>
    </div>
  );
}
