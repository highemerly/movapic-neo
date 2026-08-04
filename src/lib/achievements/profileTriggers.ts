/**
 * プロフィール起点の実績フック。
 *
 * 自己紹介は投稿にもリアクションにも紐づかないため、投稿フック（publishImage）でも
 * リアクションフック（reactionTriggers）でも確定しない。プロフィールを保存する
 * 唯一の経路（PATCH /api/v1/me）からだけ評価する。
 *
 * 本来の処理（プロフィール保存）を絶対に止めないため、例外はここで握り潰す。
 */

import { evaluateAndGrantProfile } from "./engine";

/** プロフィールを保存した直後に呼ぶ（bio は保存後の値）。 */
export async function onProfileUpdated(params: {
  userId: string;
  bio: string | null;
}): Promise<void> {
  try {
    await evaluateAndGrantProfile(params);
  } catch (error) {
    console.error(
      `[achievement] プロフィール実績の評価に失敗: userId=${params.userId}`,
      error
    );
  }
}
