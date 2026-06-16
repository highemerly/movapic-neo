/**
 * ユーザーハンドル（/u/[username] のパスセグメント）の解析・生成を1箇所に集約する。
 *
 * URL設計:
 * - 既定インスタンス（handon.club）のユーザー → 素の `username`（既存URLを温存）
 * - それ以外のインスタンス → `username@domain`（Fediverseのハンドル慣習）
 *
 * username は Mastodon/Misskey とも `[A-Za-z0-9_]` のみで `@` を含まないため、
 * 最後の `@` を区切りとして安全に分割できる。先頭の `@`（例 `/u/@alice`）は許容して除去する。
 */

// このサービスのホームインスタンス。クライアント側のリンク生成からも参照するため
// 環境変数（サーバー専用の MASTODON_INSTANCE はクライアントから読めない）ではなく定数で持つ。
// 値はコードベース全体の `MASTODON_INSTANCE || "handon.club"` フォールバックと同一。
// 将来ここを変える場合はサーバーの MASTODON_INSTANCE も合わせること。
export const DEFAULT_INSTANCE = "handon.club";

export interface UserHandle {
  username: string;
  domain: string;
}

/** `/u/[username]` セグメントを username + instance domain に分解する。 */
export function parseUserHandle(segment: string): UserHandle {
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
    return { username: s, domain: DEFAULT_INSTANCE };
  }
  return { username: s.slice(0, at), domain: s.slice(at + 1) };
}

/** username + instance domain から `/u/` のパスセグメントを生成する（既定インスタンスは素のまま）。 */
export function userPathSegment(username: string, domain: string): string {
  return domain === DEFAULT_INSTANCE ? username : `${username}@${domain}`;
}
