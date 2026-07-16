import type { FlashToast } from "@/components/ToastFlasher";

/**
 * 画像削除完了トーストを組み立てる。削除は画像詳細ページで実行後、ユーザーページへ遷移してから
 * 表示するため、遷移先（このユーザーページ）がクエリ（deleted・server）から文言を決める
 * （投稿完了フラッシュと同じ方式）。該当なし（削除以外の遷移）は null。
 * - deleted=1: local のみ削除（連携先には投稿していない/連携先は残した）
 * - deleted=remote: 連携先の投稿も削除できた（server=サーバー名を前面に出す）
 */
export function buildDeleteFlash(
  deleted: string | undefined,
  server: string | undefined
): FlashToast | null {
  if (deleted === "1") {
    return { variant: "success", message: "投稿を削除しました" };
  }
  if (deleted === "remote") {
    // サーバー名が無い異常時は連携先削除の文言だけ落として汎用メッセージにする。
    const suffix = server ? `（${server}の投稿も削除しました）` : "";
    return { variant: "success", message: `投稿を削除しました${suffix}` };
  }
  return null;
}
