/**
 * ユーザーハンドル（/u/[username] のパスセグメント）の解析・生成を1箇所に集約する。
 *
 * URL設計:
 * - ホームインスタンス（env HOME_SERVER）のユーザー → 素の `username`（既存URLを温存）
 * - それ以外のインスタンス → `username@domain`（Fediverseのハンドル慣習）
 * - HOME_SERVER 未設定なら短縮なし（全ユーザー `username@domain`・素のセグメントは解決不能）
 *
 * env はサーバー専用のため、この モジュールは純粋関数のまま homeServer を引数で受ける。
 * サーバー側は getHomeServer()（@/lib/auth/serverPolicy）、クライアント側は
 * useHomeServer()（@/components/HomeServerProvider）で解決した値を渡す。
 *
 * username は Mastodon/Misskey とも `[A-Za-z0-9_]` のみで `@` を含まないため、
 * 最後の `@` を区切りとして安全に分割できる。先頭の `@`（例 `/u/@alice`）は許容して除去する。
 */

export interface UserHandle {
  username: string;
  domain: string;
}

/**
 * `/u/[username]` セグメントを username + instance domain に分解する。
 * domain のないセグメントは homeServer 所属とみなし、homeServer 未設定なら
 * 解決不能として null を返す（呼び出し側は not found 経路へ）。
 */
export function parseUserHandle(
  segment: string,
  homeServer: string | undefined
): UserHandle | null {
  // Next.js のルートパラメータは `@` を含む場合 `%40` のままエンコードされて届くことがある。
  // 解決の単一チョークポイントなので、ここで一度デコードしておく（リテラル `@` のままなら無変化）。
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // 不正な % シーケンスはそのまま扱う
  }
  const s = decoded.startsWith("@") ? decoded.slice(1) : decoded;
  const at = s.lastIndexOf("@");
  if (at === -1) {
    return homeServer ? { username: s, domain: homeServer } : null;
  }
  return { username: s.slice(0, at), domain: s.slice(at + 1) };
}

/** username + instance domain から `/u/` のパスセグメントを生成する（ホームインスタンスのみ素のまま）。 */
export function userPathSegment(
  username: string,
  domain: string,
  homeServer: string | undefined
): string {
  return homeServer && domain === homeServer ? username : `${username}@${domain}`;
}
