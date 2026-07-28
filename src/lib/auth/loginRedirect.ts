import { userPathSegment } from "@/lib/userHandle";
import { getHomeServer } from "@/lib/auth/serverPolicy";

/**
 * 「特定ページへ戻る指定がない（＝既定）」を表すセンチネル。
 *
 * かつては `/dashboard` を流用していたが、実在ページだと「ダッシュボードへ戻る明示指定」と
 * 見分けが付かず、ページ廃止でリンク切れにもなるため、実在しないパスに変更した。
 * `sanitizeRedirectUrl` を素通りする形（先頭 `/`・`..` や制御文字を含まない）を保つこと
 * ＝素通りしないと OAuth state に載せて往復した値が別物になる。
 */
export const LOGIN_REDIRECT_DEFAULT = "/__default__";

/**
 * ログイン成功後の遷移先を決める。
 *
 * OAuth state / sanitizeRedirectUrl の既定値が {@link LOGIN_REDIRECT_DEFAULT} なので、
 * ここに来る redirectTo がセンチネルのときは returnTo が明示されていないケースと同義になる。
 * その場合は新規ユーザーを初回投稿へ、既存ユーザーを自分のユーザーページへ誘導する。
 * 明示的な returnTo（/create からの login_required 等）が渡っていればそれを尊重する。
 */
export function resolveLoginRedirect(
  redirectTo: string,
  opts: { isNewUser: boolean; username: string; instanceDomain: string }
): string {
  if (redirectTo !== LOGIN_REDIRECT_DEFAULT) {
    return redirectTo;
  }
  if (opts.isNewUser) {
    return "/create?welcome=1";
  }
  return `/u/${userPathSegment(opts.username, opts.instanceDomain, getHomeServer())}`;
}
