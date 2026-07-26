/**
 * リアクション起点の実績フック。
 *
 * 既存の実績はすべて「自分が投稿した瞬間」に確定するため publishImage の1フックで足りるが、
 * リアクションは投稿と無関係に増減する。そこでリアクションが実際に動く2箇所からだけ評価する:
 * - 押した側 … リアクションAPI の書き込み（PUT）
 * - 受け取った側 … 表示用合計 Image.favoriteCount を書き換えた瞬間（お気に入り同期・local投稿の直接更新）
 *
 * どちらも本来の処理（リアクション操作・同期）を絶対に止めないため、例外はここで握り潰す。
 * sharp/skia には触れないので worker-front から呼んでも安全。
 */

import { evaluateAndGrantReaction } from "./engine";

/** 自分がリアクションを押した（付け替え含む）直後に呼ぶ。 */
export async function onReactionGiven(userId: string, imageId: string): Promise<void> {
  try {
    // 実績の「きっかけ写真」は他人の写真になるため付けない（imageId だけで引かれる
    // 画像詳細ページの「この投稿がきっかけで獲得した実績」に混ざるため）。
    // 通知の遷移先としては押した写真が自然なので、そちらにだけ渡す。
    await evaluateAndGrantReaction({
      userId,
      achievementImageId: null,
      notificationImageId: imageId,
    });
  } catch (error) {
    console.error(`[achievement] リアクション実績の評価に失敗: userId=${userId}`, error);
  }
}

/**
 * 自分の投稿が受け取ったリアクション件数を更新した直後に呼ぶ。
 * 件数が増えた回だけ評価する（同期は閲覧のたびに走るため、増えていない回に毎度
 * 集計クエリを撃たない）。
 */
export async function onReactionsReceived(params: {
  ownerUserId: string;
  imageId: string;
  previousCount: number;
  currentCount: number;
}): Promise<void> {
  if (params.currentCount <= params.previousCount) return;
  try {
    await evaluateAndGrantReaction({
      userId: params.ownerUserId,
      achievementImageId: params.imageId,
      notificationImageId: params.imageId,
    });
  } catch (error) {
    console.error(
      `[achievement] 獲得リアクション実績の評価に失敗: imageId=${params.imageId}`,
      error
    );
  }
}
