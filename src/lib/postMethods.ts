/**
 * Web以外の投稿方法（Bot／メール）で使う設定値を env から組み立てる小ヘルパー。
 *
 * ダッシュボード・/create/bot・/create/mail・/create のモーダルが同じ表示になるよう、
 * これまで各ページに散っていた env 読み取り（MASTODON_BOT_ACCT / EMAIL_DOMAIN）を1箇所へ集約する。
 * 値はサーバー側でのみ確定するため、これらは Server Component / Server 側から呼び出す想定。
 */

/** Botのメンション宛先（例 "pic@handon.club"）。username と domain を env から組み立てる。 */
export function getBotAcct(): string {
  const username = process.env.MASTODON_BOT_ACCT || "pic";
  const domain = process.env.MASTODON_BOT_INSTANCE_DOMAIN || "handon.club";
  return `${username}@${domain}`;
}

/** メール投稿用アドレスのドメイン（例 "pic.handon.club"）。ユーザーごとの prefix と組み合わせて使う。 */
export function getEmailDomain(): string {
  return process.env.EMAIL_DOMAIN || "pic.handon.club";
}
