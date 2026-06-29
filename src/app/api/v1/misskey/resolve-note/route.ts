/**
 * Misskeyノート解決エンドポイント
 * GET /api/v1/misskey/resolve-note?url={投稿URL}
 *
 * 画像詳細ページの「あなたのサーバーで開く」を Misskey viewer 向けに実現する。
 * Mastodon は authorize_interaction で即開けるが、Misskey には相当する固定URLが無いため、
 * viewer 自身のトークンで ap/show 解決し、viewer サーバー上のノートURL（/notes/{id}）を返す。
 * クライアントはそのURLを新タブで開く（= Mastodon の authorize_interaction と同じ体感）。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithValidation } from "@/lib/auth/session";
import { decryptToken } from "@/lib/auth/tokens";
import { apShowNoteId } from "@/lib/fediverse/misskey";

const RESOLVE_TIMEOUT = 10000; // 10秒（viewerサーバーがリモート取得に行くため長め）

export async function GET(request: NextRequest) {
  try {
    const viewer = await getCurrentUserWithValidation();
    if (!viewer) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (viewer.instance.type !== "misskey") {
      // Mastodon はクライアント側で authorize_interaction を直接開くため、ここには来ない
      return NextResponse.json(
        { error: "Misskeyアカウント専用です" },
        { status: 400 }
      );
    }

    const url = request.nextUrl.searchParams.get("url");
    if (!url || !/^https:\/\//.test(url)) {
      return NextResponse.json({ error: "URLが不正です" }, { status: 400 });
    }
    let postHost: string;
    try {
      postHost = new URL(url).host;
    } catch {
      return NextResponse.json({ error: "URLが不正です" }, { status: 400 });
    }

    const viewerDomain = viewer.instance.domain;

    // 既に viewer 自身のサーバーのノートなら解決不要でそのまま開ける
    if (postHost === viewerDomain) {
      return NextResponse.json({ url });
    }

    // 別サーバーの投稿: viewer のトークンで ap/show 解決し、ローカルの noteId を得る
    const token = decryptToken(viewer.accessToken);
    let noteId: string | null;
    try {
      noteId = await apShowNoteId(viewerDomain, token, url, RESOLVE_TIMEOUT);
    } catch {
      // ap/show のHTTPエラー/接続失敗
      return NextResponse.json(
        { error: "あなたのサーバーで投稿を解決できませんでした" },
        { status: 502 }
      );
    }

    if (!noteId) {
      // 連合の未伝播など。少し待てば解決できることが多い。
      return NextResponse.json(
        { error: "投稿がまだあなたのサーバーに反映されていないようです。少し時間をおいてお試しください" },
        { status: 404 }
      );
    }

    return NextResponse.json({ url: `https://${viewerDomain}/notes/${noteId}` });
  } catch (error) {
    console.error("Failed to resolve note:", error);
    return NextResponse.json({ error: "投稿を開けませんでした" }, { status: 500 });
  }
}
