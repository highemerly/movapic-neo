/**
 * トップページの注目画像（src/app/page.tsx の unstable_cache）のキャッシュ tag と破棄。
 */

import { revalidateTag } from "next/cache";

export const FEATURED_IMAGES_TAG = "featured-images";

/**
 * 注目画像のキャッシュを即座に破棄する。画像の削除・取り下げ・退会のあとに呼ぶ。
 * pitfall: 以前は誰も破棄しておらず、取り下げ・削除した画像がトップに最大5分残った。
 * "max" ではなく { expire: 0 }: "max" は次のリクエストに古い内容を返しながら作り直す
 * （stale-while-revalidate）ため、取り下げた画像がもう一度表示されてしまう。
 */
export function expireFeaturedImages(): void {
  revalidateTag(FEATURED_IMAGES_TAG, { expire: 0 });
}
