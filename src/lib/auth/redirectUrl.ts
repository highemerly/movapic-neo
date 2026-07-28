/**
 * ログイン後の遷移先（returnTo / callbackUrl）として受け入れてよい値の判定を1箇所に置く。
 *
 * 依存ゼロのモジュールにしてあるのは、同じ規則をサーバー（OAuthコールバック）とクライアント
 * （ログインカードの returnTo 表示）の両方が使うため。crypto.ts は node:crypto を、
 * loginRedirect.ts は serverPolicy（env）を引くのでクライアントから import できず、
 * 置き場所を分けないと規則が手書きで複製される（実際に LoginSection.tsx に弱いコピーがあった）。
 * sessionConstants.ts を edge-safe に切り出しているのと同じ理由。
 *
 * 判定は isSafeRedirectPath の1本だけで、公開している2つは「安全でなかったときに何を返すか」
 * だけが違う薄いラッパー。片方だけ直して規則がずれることが起きないようにしている。
 */

/**
 * 「特定ページへ戻る指定がない（＝既定）」を表すセンチネル。
 *
 * かつては `/dashboard` を流用していたが、実在ページだと「ダッシュボードへ戻る明示指定」と
 * 見分けが付かず、ページ廃止でリンク切れにもなるため、実在しないパスに変更した。
 * isSafeRedirectPath を通る形（先頭 `/`・`..` や制御文字を含まない）を保つこと
 * ＝通らないと OAuth state に載せて往復した値が別物になる。
 */
export const LOGIN_REDIRECT_DEFAULT = "/__default__";

/**
 * 自サイト内のパスとして安全に遷移先に使える形か。
 * 外部URL・プロトコル相対・相対パス・パストラバーサル・制御文字を弾く。
 */
function isSafeRedirectPath(trimmed: string): boolean {
  if (!trimmed) return false;
  // プロトコル付きURL（http://, javascript:, mailto: 等）とプロトコル相対URL（//evil.com）
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("//")) return false;
  // スラッシュ始まりでなければ相対パス（外部ホストへ解決され得る）
  if (!trimmed.startsWith("/")) return false;
  // Windows形式のパス区切り（ブラウザによっては / と同視される）
  if (trimmed.includes("\\")) return false;
  // パストラバーサル
  if (trimmed.includes("..")) return false;
  // 制御文字・null byte（ヘッダ分割やパーサの差異を突かれる）
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return false;
  return true;
}

/**
 * 遷移先を「必ず何かのパス」に確定させる。安全でなければ defaultPath へ差し戻す。
 * OAuthコールバックのように、遷移先が無いという状態を持てない場所で使う。
 */
export function sanitizeRedirectUrl(
  url: string | null | undefined,
  defaultPath: string = LOGIN_REDIRECT_DEFAULT
): string {
  return parseReturnTo(url) ?? defaultPath;
}

/**
 * 外部入力（クエリの `returnTo` 等）を「明示された遷移先」として読む。
 * 未指定・安全でない値はどちらも undefined ＝「指定なし」に潰す。
 *
 * sanitizeRedirectUrl と違って既定値へ差し戻さないのは、呼び出し側が「戻り先が指定されている」
 * ことを条件に案内文やバナーを出し分けるため（ゴミが入っていたときに指定ありと誤認させない）。
 */
export function parseReturnTo(url: string | null | undefined): string | undefined {
  if (typeof url !== "string") return undefined;
  const trimmed = url.trim();
  return isSafeRedirectPath(trimmed) ? trimmed : undefined;
}
