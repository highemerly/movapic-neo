import type { FlashToast } from "@/components/ToastFlasher";
import { failureAdvice } from "@/lib/fediverse/failureAdvice";

// 原因の推定はステータスコードから共通に決まる（@/lib/fediverse/failureAdvice）。
// Web 固有なのは対処の導線だけ：再投稿はこのページの「⋯（その他）」メニュー内にある（ImageActionsMenu）。
const WEB_SUGGESTIONS = {
  retry: "しばらく待ってから、この投稿の「⋯（その他）」メニューから再投稿してください",
  relogin:
    "一度ログアウトして再ログインしてから、この投稿の「⋯（その他）」メニューから再投稿してください",
};

/**
 * 投稿結果のトーストを組み立てる。作成フロー（遷移後フラッシュ）と再投稿フロー（その場）で共有する。
 * - 成功: 「{server} への投稿が完了しました」（Fediverse投稿）／「投稿が完了しました」（local）
 * - 連合投稿だけ失敗（部分的成功）: 警告。完了ではないので自動では消さない（duration: Infinity）。
 */
export function buildPostFlash({
  fediverseFailed,
  fediversePosted,
  serverDomain,
  statusCode,
}: {
  fediverseFailed: boolean;
  /** 成功時、連携サーバーへ投稿したか（local=false なら汎用文言）。 */
  fediversePosted: boolean;
  serverDomain: string;
  statusCode?: number;
}): FlashToast {
  if (!fediverseFailed) {
    return {
      variant: "success",
      message: fediversePosted
        ? `${serverDomain} への投稿が完了しました`
        : "投稿が完了しました",
    };
  }

  const response = statusCode !== undefined ? `${statusCode}` : "応答なし";
  const { explanation, suggestion } = failureAdvice(serverDomain, statusCode, WEB_SUGGESTIONS);
  return {
    variant: "warning",
    message: `${serverDomain} への投稿に失敗しました（サーバーからの応答： ${response}）`,
    // 2行（原因の推定＋対処）を改行で見せる。descriptionClassName で pre-line を効かせる。
    description: `${explanation}\n${suggestion}`,
    descriptionClassName: "whitespace-pre-line",
    duration: Infinity,
  };
}
