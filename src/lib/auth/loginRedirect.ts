import { userPathSegment } from "@/lib/userHandle";
import { getHomeServer } from "@/lib/auth/serverPolicy";
import { LOGIN_REDIRECT_DEFAULT } from "@/lib/auth/redirectUrl";

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
