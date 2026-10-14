/**
 * リプライ先の画像を、投稿者（viewer）自身のインスタンス上の status / note ID に解決する。
 *
 * Fediverse 上でスレッドに繋げるには、返信先を「投稿するサーバー上の ID」で指定する必要がある。
 * 親が投稿者と同じサーバーにあれば Image.postId をそのまま使えるが、別サーバーの投稿は
 * viewer のサーバーに連合取得させて ID を得る（Mastodon=search?resolve / Misskey=ap/show）。
 *
 * 解決できないときも投稿は止めず、理由つきで「SHAMEZO 内だけで繋ぐ」を返す（throw しない）。
 * 理由は型で区別し、呼び出し側がログ・画面表示に使う（docs/reply.md「繋げられないケース」）。
 *
 * sharp/skia 非依存。
 */

import prisma from "@/lib/db";
import { searchResolveStatusId, SearchResolveError } from "@/lib/fediverse/mastodon";
import { apShowNoteId, ApShowError } from "@/lib/fediverse/misskey";

export type ReplyLink =
  | { kind: "linked"; postId: string }
  | {
      kind: "shamezo-only";
      /**
       * - parent-gone:          親画像が既に無い（解決までの間に削除された）
       * - parent-not-federated: 親が Fediverse に投稿されていない（local・投稿失敗）＝仕様どおり SHAMEZO 内だけ
       * - unresolved:           viewer のサーバーで親を見つけられない（連合の未伝播など）
       * - resolve-failed:       解決の往復が失敗した（HTTPエラー・タイムアウト）
       */
      reason: "parent-gone" | "parent-not-federated" | "unresolved" | "resolve-failed";
      status?: number;
    };

/**
 * 投稿の同期処理（/api/v1/post）の中で待つため、お気に入りの解決（10秒）より短くする。
 * Ingress の504に近づけないための上限。
 */
export const REPLY_RESOLVE_TIMEOUT_MS = 5000;

export async function resolveFediverseReplyTarget(params: {
  replyToImageId: string;
  viewer: { domain: string; type: string; accessToken: string };
}): Promise<ReplyLink> {
  const { replyToImageId, viewer } = params;

  const parent = await prisma.image.findUnique({
    where: { id: replyToImageId },
    select: {
      postId: true,
      postUrl: true,
      user: { select: { instance: { select: { domain: true } } } },
    },
  });
  if (!parent) return { kind: "shamezo-only", reason: "parent-gone" };
  if (!parent.postId || !parent.postUrl) {
    return { kind: "shamezo-only", reason: "parent-not-federated" };
  }

  const ownerDomain = parent.user.instance.domain;
  if (ownerDomain === viewer.domain) {
    return { kind: "linked", postId: parent.postId };
  }

  try {
    let resolved: string | null = null;
    if (viewer.type === "mastodon") {
      resolved = await searchResolveStatusId(
        viewer.domain,
        viewer.accessToken,
        parent.postUrl,
        REPLY_RESOLVE_TIMEOUT_MS
      );
    } else if (viewer.type === "misskey") {
      resolved = await apShowNoteId(
        viewer.domain,
        viewer.accessToken,
        parent.postUrl,
        REPLY_RESOLVE_TIMEOUT_MS
      );
    }
    if (!resolved) return { kind: "shamezo-only", reason: "unresolved" };
    return { kind: "linked", postId: resolved };
  } catch (error) {
    const status =
      error instanceof SearchResolveError || error instanceof ApShowError
        ? error.status
        : undefined;
    console.warn(
      `[reply] resolve failed: viewer=${viewer.domain} owner=${ownerDomain} status=${status ?? "-"} ` +
        `error=${error instanceof Error ? error.message : String(error)}`
    );
    return { kind: "shamezo-only", reason: "resolve-failed", status };
  }
}
