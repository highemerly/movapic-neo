import { parseUserHandle } from "@/lib/userHandle";

/**
 * 存在しないユーザーページ（not-found）で、URLから「誰を探していたか」を復元する。
 *
 * Next.js の not-found.tsx は params を受け取れないため、pathname（/u/<セグメント>/...）から
 * ハンドルを組み直す。SHAMEZO に居なくても当該サーバーには居る可能性があるので、
 * リンク先（https://domain/@username）まで作って案内に使う。
 */

/** Mastodon/Misskey の username に使える文字（parseUserHandle が `@` 分割を前提にしている範囲と同じ）。 */
const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;

/** ドメイン（ラベル.ラベル…）。URLに含める前に形だけ検証する。 */
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export interface MissingUser {
  username: string;
  domain: string;
  /** `username@domain` 形式の表示用ハンドル */
  handle: string;
  /** 当該サーバー上のプロフィールURL（Mastodon/Misskey とも `/@username`） */
  profileUrl: string;
}

/**
 * pathname からユーザーハンドルを復元する。
 * `/u/` 配下でない・解析できない・username/domain の形が不正なときは null
 * （＝リンクを出さない。URLは任意文字列が来るため、形が確かなものだけ外部リンクにする）。
 */
export function resolveMissingUser(
  pathname: string,
  homeServer: string | undefined
): MissingUser | null {
  const segments = pathname.split("/");
  // ["", "u", "<セグメント>", ...]
  if (segments[1] !== "u") return null;
  const segment = segments[2];
  if (!segment) return null;

  const parsed = parseUserHandle(segment, homeServer);
  if (!parsed) return null;

  const { username, domain } = parsed;
  if (!USERNAME_PATTERN.test(username)) return null;
  if (!DOMAIN_PATTERN.test(domain)) return null;

  return {
    username,
    domain,
    handle: `${username}@${domain}`,
    profileUrl: `https://${domain}/@${username}`,
  };
}

/** ユーザーページのタブキー（UserProfileHeader と同じ並び）。 */
const TAB_KEYS = ["photos", "calendar", "map", "achievements"] as const;

/**
 * pathname の `/u/<セグメント>/<タブ>` からタブキーを決める。
 * 404 でもタブ位置は URL どおりに見せる（どのタブで行き止まったかが分かる）。未指定・不明はホーム。
 */
export function resolveMissingUserTab(pathname: string): string {
  const tab = pathname.split("/")[3];
  return (TAB_KEYS as readonly string[]).includes(tab) ? tab : "home";
}
