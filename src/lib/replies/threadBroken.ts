/**
 * スレッドに投稿したが、Fediverse 上ではリプライ先に繋げられなかったときの利用者向け説明文。
 * Web の完了トーストと Bot の debug 返信で共有する。クライアントからも import されるため、
 * サーバー専用 API・env を import しないこと。
 *
 * 原因（返信先が削除済み・連合が未反映で見つからない・往復の失敗）は区別せず同じ文言にする。
 * 「削除されていました」と言い切ると、見つけられなかっただけの場合に誤りになるため。
 * 原因はサーバーログ（[reply] posted without thread の link / replyDropped）で追う。
 */
export function threadBrokenMessage(serverDomain: string): string {
  return `スレッドの前の投稿が ${serverDomain} で見つかりませんでした`;
}
