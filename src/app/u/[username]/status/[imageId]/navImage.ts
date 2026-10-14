/**
 * 画像詳細の小プレビュー（前後ナビ・スレッドのリプライ先/リプライ）で共有する画像の形・取得列・URL。
 */

import { userPathSegment } from "@/lib/userHandle";
import { getHomeServer } from "@/lib/auth/serverPolicy";

/** 小プレビューに必要な列（Prisma の select と NavImage を一致させる）。 */
export const navImageSelect = {
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
} as const;

export interface NavImage {
  id: string;
  overlayText: string;
  thumbnailKey: string | null;
  storageKey: string;
  user: {
    username: string;
    instance: {
      domain: string;
    };
  };
}

/** /u/ のパスセグメント（既定インスタンスは素の username、他は username@domain）。 */
export function navImageUserSegment(image: NavImage): string {
  return userPathSegment(image.user.username, image.user.instance.domain, getHomeServer());
}

/** 画像詳細ページへのパス。query は "?from=..." のような先頭 ? 付き文字列。 */
export function navImageHref(image: NavImage, query = ""): string {
  return `/u/${navImageUserSegment(image)}/status/${image.id}${query}`;
}

/**
 * サムネイルURL（サムネイルがなければフルサイズ画像にフォールバック）。
 * 保存サムネ（128px WebP）は縮小表示でデコードが軽くリトライ不要＝素の <img> でよい（docs/ui.md）。
 */
export function navImageThumbnailUrl(image: NavImage, publicUrl: string): string {
  return `${publicUrl}/${image.thumbnailKey || image.storageKey}`;
}
