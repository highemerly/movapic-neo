import { userPathSegment } from "@/lib/userHandle";
import { getHomeServer } from "@/lib/auth/serverPolicy";

/**
 * ログイン成功後の遷移先を決める。
 *
 * `/dashboard` は「特定ページへ戻る指定がない（＝既定）」を表すセンチネル。
 * OAuth state / sanitizeRedirectUrl の既定値が `/dashboard` なので、ここに来る redirectTo が
 * `/dashboard` のときは returnTo が明示されていないケースと同義になる。ダッシュボードは
 * どこからもリンクしない方針（直接URLのみ）のため、既定時はダッシュボードへは送らず、
 * 新規ユーザーは初回投稿へ、既存ユーザーは自分のユーザーページへ誘導する。
 * 明示的な returnTo（/create からの login_required 等）が渡っていればそれを尊重する。
 */
export function resolveLoginRedirect(
  redirectTo: string,
  opts: { isNewUser: boolean; username: string; instanceDomain: string }
): string {
  if (redirectTo !== "/dashboard") {
    return redirectTo;
  }
  if (opts.isNewUser) {
    return "/create?welcome=1";
  }
  return `/u/${userPathSegment(opts.username, opts.instanceDomain, getHomeServer())}`;
}
