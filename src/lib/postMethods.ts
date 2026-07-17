/**
 * Web以外の投稿方法（Bot／メール）で使う設定値を env から組み立てる小ヘルパー。
 *
 * ダッシュボード・/create/bot・/create/mail・/create のモーダルが同じ表示になるよう、
 * これまで各ページに散っていた env 読み取り（MASTODON_BOT_ACCT / EMAIL_DOMAIN）を1箇所へ集約する。
 * 値はサーバー側でのみ確定するため、これらは Server Component / Server 側から呼び出す想定。
 * env 未設定＝その投稿方法は未提供とみなし null を返す（呼び出し側はガイド等を非表示にする）。
 */

/** Botのメンション宛先（例 "pic@handon.club"）。env 未設定なら null（Bot投稿は未提供）。 */
export function getBotAcct(): string | null {
  const username = process.env.MASTODON_BOT_ACCT;
  const domain = process.env.MASTODON_BOT_INSTANCE_DOMAIN;
  if (!username || !domain) return null;
  return `${username}@${domain}`;
}

/** メール投稿用アドレスのドメイン（例 "pic.handon.club"）。env 未設定なら null（メール投稿は未提供）。 */
export function getEmailDomain(): string | null {
  return process.env.EMAIL_DOMAIN || null;
}
