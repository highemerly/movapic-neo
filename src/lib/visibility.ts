/**
 * 公開範囲（visibility）の正規化・プラットフォーム別変換を集約する。
 *
 * - サービス内 visibility: public / unlisted / local
 * - Mastodon: unlisted はそのまま、それ以外は public（local は投稿しない）
 * - Misskey: unlisted は home（非収載相当）、それ以外は public
 */

import type { MastodonVisibility, MisskeyVisibility } from "@/lib/fediverse/post";

/** サービス内の公開範囲（UI/DBと同じ値） */
export type PublishVisibility = "public" | "unlisted" | "local";

/**
 * 任意の入力値をサービス内 visibility に正規化する。
 * "local"/"unlisted" 以外（未知・null 含む）は "public" にフォールバック。
 */
export function normalizeVisibility(
  v: string | null | undefined
): PublishVisibility {
  return v === "local" ? "local" : v === "unlisted" ? "unlisted" : "public";
}

/** サービス内 visibility → Mastodon の visibility */
export function toMastodonVisibility(v: PublishVisibility): MastodonVisibility {
  return v === "unlisted" ? "unlisted" : "public";
}

/** サービス内 visibility → Misskey の visibility（unlisted は home 相当） */
export function toMisskeyVisibility(v: PublishVisibility): MisskeyVisibility {
  return v === "unlisted" ? "home" : "public";
}
