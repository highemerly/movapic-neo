/**
 * カレンダー画像（コラージュ）の投稿API
 * POST /api/v1/calendar/collage/post
 *
 * 認証必須（自分のカレンダーのみ）。プレビューで生成した画像（Blob）を受け取り、
 * 本人アカウントで Fediverse に投稿する。サービス側にはDB保存しない（TL非汚染・
 * メディアは投稿先インスタンスがホスト）。/api/v1/post と同じく「生成済みBlobを信任」する。
 *
 * 公開範囲は public / unlisted / followers（フォロワー限定）に対応。
 * - Mastodon: public / unlisted / private(=followers)
 * - Misskey:  public / home(=unlisted) / followers
 *
 * in: multipart/form-data { image(Blob), year, month, visibility }
 * out: { success, postUrl? }
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithValidation } from "@/lib/auth/session";
import { decryptToken } from "@/lib/auth/tokens";
import {
  fetchCalendarImages,
  resolveCalendarMonth,
  buildCollageCaption,
} from "@/lib/calendar/resolveMonth";
import {
  postToMastodon,
  postToMisskey,
  type PostResult,
  type MastodonVisibility,
  type MisskeyVisibility,
} from "@/lib/fediverse/post";
import { userPathSegment } from "@/lib/userHandle";
import { getHomeServer } from "@/lib/auth/serverPolicy";
import { MAX_FILE_SIZE } from "@/types";

// 受け付ける画像形式（生成側は JPEG。将来 WebP 化しても許容）。
const ALLOWED_MIME = new Set(["image/jpeg", "image/webp"]);

/** コラージュ投稿の公開範囲。DB保存しないため PublishVisibility とは別に followers を持つ。 */
type CollageVisibility = "public" | "unlisted" | "followers";

function normalizeCollageVisibility(v: string | null): CollageVisibility | null {
  return v === "public" || v === "unlisted" || v === "followers" ? v : null;
}

function toMastodon(v: CollageVisibility): MastodonVisibility {
  return v === "followers" ? "private" : v === "unlisted" ? "unlisted" : "public";
}

function toMisskey(v: CollageVisibility): MisskeyVisibility {
  return v === "followers" ? "followers" : v === "unlisted" ? "home" : "public";
}

const RETRY_BACKOFF_MS = 500;

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserWithValidation();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const formData = await request.formData();
    const imageBlob = formData.get("image") as Blob | null;
    const year = Number(formData.get("year"));
    const month = Number(formData.get("month"));
    const visibility = normalizeCollageVisibility(
      formData.get("visibility") as string | null
    );

    if (!imageBlob) {
      return NextResponse.json({ error: "画像がありません" }, { status: 400 });
    }
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "年月が不正です" }, { status: 400 });
    }
    if (!visibility) {
      return NextResponse.json({ error: "公開範囲が不正です" }, { status: 400 });
    }
    if (imageBlob.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "ファイルサイズが大きすぎます" }, { status: 400 });
    }
    const contentType = imageBlob.type || "image/jpeg";
    if (!ALLOWED_MIME.has(contentType)) {
      return NextResponse.json({ error: "サポートされていない画像形式です" }, { status: 400 });
    }

    // キャプションはサーバー側で確定（皆勤判定を再解決＝クライアント値を信任しない）。
    const images = await fetchCalendarImages(user.id, year, month);
    const resolved = resolveCalendarMonth({
      images,
      year,
      month,
      domain: user.instance.domain,
      now: new Date(),
    });
    if (resolved.isFutureMonth) {
      return NextResponse.json({ error: "未来の月は投稿できません" }, { status: 400 });
    }

    const caption = buildCollageCaption(year, month, resolved.isPerfectAttendance);
    const altText = `${year}年${month}月のSHAMEZOカレンダー`;
    const buffer = Buffer.from(await imageBlob.arrayBuffer());
    const ext = contentType === "image/webp" ? "webp" : "jpg";
    const filename = `shamezo-calendar-${year}-${String(month).padStart(2, "0")}.${ext}`;
    const token = decryptToken(user.accessToken);
    const domain = user.instance.domain;

    // 本文末尾に該当カレンダーページのURLを付ける（postToXxx の imageUrl 引数＝本文に \n で連結）。
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
    const calendarUrl = `${appUrl}/u/${userPathSegment(user.username, domain, getHomeServer())}/calendar?year=${year}&month=${month}`;

    // 5xx のときだけ1回再試行。
    const postOnce = (): Promise<PostResult | null> => {
      if (user.instance.type === "mastodon") {
        return postToMastodon(
          domain,
          token,
          buffer,
          contentType,
          filename,
          caption,
          calendarUrl,
          toMastodon(visibility),
          altText
        );
      }
      if (user.instance.type === "misskey") {
        return postToMisskey(
          domain,
          token,
          buffer,
          contentType,
          filename,
          caption,
          calendarUrl,
          toMisskey(visibility),
          altText
        );
      }
      return Promise.resolve({
        success: false,
        error: "サポートされていないプラットフォームです",
      });
    };

    console.log(
      `[collage-post] user=${user.username}@${domain} type=${user.instance.type} vis=${visibility} bytes=${buffer.length}`
    );

    let result = await postOnce();
    if (result && !result.success && result.statusCode && result.statusCode >= 500) {
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
      result = await postOnce();
    }

    if (!result || !result.success) {
      console.error(
        `[collage-post] fediverse failed: status=${result?.statusCode} error=${result?.error}`
      );
      return NextResponse.json(
        { success: false, error: result?.error ?? "投稿に失敗しました" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, postUrl: result.postUrl });
  } catch (error) {
    console.error("Calendar collage post error:", error);
    return NextResponse.json({ error: "投稿に失敗しました" }, { status: 500 });
  }
}
