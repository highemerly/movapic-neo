/**
 * プロフィール更新エンドポイント
 * PATCH /api/v1/me
 *
 * 旧 GET /api/v1/me は廃止（クライアントの自己セッションfetchを全廃したため）。
 * 表示用の識別情報は JWT（getSessionClaims）から、フォーム初期値はサーバー側で
 * getCurrentUserWithPreferences から取得する。
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/db";
import { ROBOTS_BLOCKLIST_TAG } from "@/lib/crawlers";

/**
 * 認証済みユーザー向けレスポンス用ヘルパー。
 * 共有キャッシュ・ブラウザバックでの他ユーザーへの混入を防ぐため、
 * すべての応答に Cache-Control: private, no-store を付与する。
 */
function jsonNoStore(body: unknown, init?: ResponseInit): NextResponse {
  const json = NextResponse.json;
  return json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * HTMLタグと制御文字を除去してサニタイズ
 */
function sanitizeBio(input: string): string {
  return input
    // HTMLタグを除去
    .replace(/<[^>]*>/g, "")
    // HTMLエンティティをデコードして除去（&lt; &gt; など）
    .replace(/&[a-zA-Z0-9#]+;/g, "")
    // 制御文字を除去（改行・タブは許可しない）
    .replace(/[\x00-\x1F\x7F]/g, "")
    // 前後の空白を除去
    .trim();
}

const BIO_MAX_LENGTH = 40;

export async function PATCH(request: NextRequest) {
  try {
    const sessionUser = await getCurrentUser();

    if (!sessionUser) {
      return jsonNoStore({ error: "認証が必要です" }, { status: 401 });
    }

    const body = await request.json();

    // 更新するフィールドを収集
    const updateData: {
      bio?: string | null;
      mentionKeep?: boolean;
      showLocationMap?: boolean;
      blockCrawlers?: boolean;
      autoMakeup?: boolean;
    } = {};

    // bioの更新
    if (body.bio !== undefined) {
      if (typeof body.bio !== "string") {
        return jsonNoStore(
          { error: "bioは文字列である必要があります" },
          { status: 400 }
        );
      }

      // サニタイズして長さチェック
      const sanitizedBio = sanitizeBio(body.bio);

      if (sanitizedBio.length > BIO_MAX_LENGTH) {
        return jsonNoStore(
          { error: `プロフィールは${BIO_MAX_LENGTH}文字以内で入力してください` },
          { status: 400 }
        );
      }

      // 空文字の場合はnullとして保存
      updateData.bio = sanitizedBio.length === 0 ? null : sanitizedBio;
    }

    // mentionKeepの更新
    if (body.mentionKeep !== undefined) {
      if (typeof body.mentionKeep !== "boolean") {
        return jsonNoStore(
          { error: "mentionKeepはboolean型である必要があります" },
          { status: 400 }
        );
      }
      updateData.mentionKeep = body.mentionKeep;
    }

    // showLocationMapの更新（地図機能の公開オプトイン）
    if (body.showLocationMap !== undefined) {
      if (typeof body.showLocationMap !== "boolean") {
        return jsonNoStore(
          { error: "showLocationMapはboolean型である必要があります" },
          { status: 400 }
        );
      }
      updateData.showLocationMap = body.showLocationMap;
    }

    // blockCrawlersの更新（検索エンジン/AI Botのクロール拒否オプトイン）
    if (body.blockCrawlers !== undefined) {
      if (typeof body.blockCrawlers !== "boolean") {
        return jsonNoStore(
          { error: "blockCrawlersはboolean型である必要があります" },
          { status: 400 }
        );
      }
      updateData.blockCrawlers = body.blockCrawlers;
    }

    // autoMakeupの更新（カレンダーの自動穴埋め。OFFで投稿時の自動割当を止める）
    if (body.autoMakeup !== undefined) {
      if (typeof body.autoMakeup !== "boolean") {
        return jsonNoStore(
          { error: "autoMakeupはboolean型である必要があります" },
          { status: 400 }
        );
      }
      updateData.autoMakeup = body.autoMakeup;
    }

    // 更新するフィールドがない場合
    if (Object.keys(updateData).length === 0) {
      return jsonNoStore(
        { error: "更新するフィールドがありません" },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: sessionUser.id },
      data: updateData,
      select: {
        bio: true,
        mentionKeep: true,
        showLocationMap: true,
        blockCrawlers: true,
        autoMakeup: true,
      },
    });

    // robots.txt のブロックリストキャッシュを即時破棄（検証用にも即反映）
    if (updateData.blockCrawlers !== undefined) {
      revalidateTag(ROBOTS_BLOCKLIST_TAG, "max");
    }

    return jsonNoStore({
      success: true,
      bio: updatedUser.bio,
      mentionKeep: updatedUser.mentionKeep,
      showLocationMap: updatedUser.showLocationMap,
      blockCrawlers: updatedUser.blockCrawlers,
      autoMakeup: updatedUser.autoMakeup,
    });
  } catch (error) {
    console.error("Failed to update profile:", error);
    return jsonNoStore(
      { error: "プロフィールの更新に失敗しました" },
      { status: 500 }
    );
  }
}
