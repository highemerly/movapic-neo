/**
 * Fediverse アカウントの識別子（サーバーのドメイン・ユーザー名）として受け付ける値の規則。
 *
 * どちらも Instance.domain / User.username としてそのまま保存され、URL（/u/<username>@<domain>）や
 * robots.txt の Disallow 行、管理者判定（ADMIN_ACCTS）、DENIED/ALLOWED_SERVERS の照合に使われる。
 * pitfall: 以前は無検証で、ドメインに改行を含めて入力する（URL パーサーは改行を黙って除くので通信は
 * 成立する）か、リモートが改行入りのユーザー名を返すと、robots.txt に任意の行を差し込めた。
 * また "spam.example:443" "spam.example." "spam.example/x" は同じホストへ通信するのに
 * DENIED_SERVERS の完全一致をすり抜けた。
 */

import { domainToASCII } from "node:url";

/**
 * サーバー名を正規化
 */
export function normalizeServer(server: string): string {
  // プロトコルを除去。i フラグ必須: 大文字混じり（HTTPS://）だと除去されないまま
  // 後段の toLowerCase() で "https://example" がドメイン名として残り、
  // URL 解釈時にホスト名が "https" になって「サーバーが見つかりません」になる。
  let normalized = server.replace(/^https?:\/\//i, "");
  // 末尾のスラッシュを除去
  normalized = normalized.replace(/\/+$/, "");
  // 小文字に変換
  normalized = normalized.toLowerCase();
  return normalized;
}

/**
 * ログイン画面の入力を正規化し、ホスト名だけで構成されていればそれを返す。そうでなければ null。
 * 日本語ドメインは入力どおり（Unicode のまま）返す＝既存の Instance.domain と同じ形を保つ。
 */
export function parseServerHostname(server: string): string | null {
  // 末尾のドットは同じホストの別表記なので落とす（拒否リストのすり抜け防止）
  const normalized = normalizeServer(server.trim()).replace(/\.+$/, "");
  // URL パーサーは改行・タブを黙って取り除くため、パース前に弾く
  if (normalized === "" || /[\s\u0000-\u001f\u007f]/.test(normalized)) return null;

  let url: URL;
  try {
    url = new URL(`https://${normalized}`);
  } catch {
    return null;
  }
  if (url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    return null;
  }
  // ":443" は既定ポートとして URL から落ちるため上の判定を通る。入力そのものがホスト名として
  // 解釈できること（ASCII 化した結果が URL のホスト名と一致すること）で確かめる。
  if (domainToASCII(normalized) !== url.hostname) return null;
  return normalized;
}

/**
 * ログインするアカウント（各サーバーのローカルアカウント）のユーザー名として受け付けるか。
 * 各実装のローカルユーザー名の規則をすべて含む範囲（2026-10-15 に公式ソースで確認）:
 *  - Mastodon: /\A[a-z0-9_]+\z/i・最大30（app/models/account.rb）
 *  - Misskey: /^\w{1,20}$/（packages/backend/src/models/User.ts）
 *  - GoToSocial: ^[a-z0-9_]{1,64}$（internal/regexes/regexes.go）
 *  - Pleroma: ^[a-zA-Z\d]+$、extended_nickname_format 時は ^[a-zA-Z\d_-]+$
 * "." は含めない（Mastodon の USERNAME_RE にあるがリモートアカウント用で、ログイン本人には無い）。
 */
const USERNAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isAcceptableUsername(username: unknown): username is string {
  return typeof username === "string" && USERNAME_RE.test(username);
}
