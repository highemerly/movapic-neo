/**
 * 共通の Prisma select プリセット
 */

import { Prisma } from "@prisma/client";

/**
 * 公開一覧（タイムライン / お気に入り）で返す Image フィールド。
 * 投稿者の最小情報（username/displayName/avatarUrl/instance.domain）を含む。
 */
export const PUBLIC_IMAGE_LIST_SELECT = {
  id: true,
  storageKey: true,
  width: true,
  height: true,
  overlayText: true,
  position: true,
  size: true,
  blurDataUrl: true,
  favoriteCount: true,
  createdAt: true,
  user: {
    select: {
      username: true,
      displayName: true,
      avatarUrl: true,
      instance: { select: { domain: true } },
    },
  },
} satisfies Prisma.ImageSelect;
