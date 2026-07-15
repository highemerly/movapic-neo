/**
 * 画像をR2に保存してFediverseに投稿するAPI
 * POST /api/v1/post
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithValidation } from "@/lib/auth/session";
import { checkPostRateLimit } from "@/lib/postRateLimit";
import { decryptToken } from "@/lib/auth/tokens";
import { reverseGeocode } from "@/lib/geocode/gsi";
import { userHasPostedLocation } from "@/lib/locations";
import { finalizeImage } from "@/lib/compute/client";
import { publishImage } from "@/lib/publish/publishImage";
import { normalizeVisibility } from "@/lib/visibility";
import { isSeasonActiveNow, getSeasonByKey } from "@/lib/seasons/catalog";
import {
  Position,
  FontFamily,
  Color,
  Size,
  OutputFormat,
  Arrangement,
  MAX_FILE_SIZE,
  MAX_TEXT_LENGTH,
  DEFAULT_POSITION,
  DEFAULT_COLOR,
  DEFAULT_SIZE,
  DEFAULT_FONT,
  DEFAULT_ARRANGEMENT,
  isValidPosition,
  isValidFont,
  isValidColor,
  isValidSize,
  isValidOutput,
  isValidArrangement,
} from "@/types";
import { countGraphemes } from "@/lib/text/grapheme";

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const user = await getCurrentUserWithValidation();
    if (!user) {
      return NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 }
      );
    }

    // 投稿レート制限（ユーザー単位）。重い画像処理の前に弾く。
    const rate = await checkPostRateLimit(user.id);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "投稿が多すぎます。しばらく待ってから再度お試しください。" },
        {
          status: 429,
          headers: rate.retryAfter
            ? { "Retry-After": String(rate.retryAfter) }
            : undefined,
        }
      );
    }

    const formData = await request.formData();

    // パラメータの取得
    const imageBlob = formData.get("image") as Blob | null;
    const text = formData.get("text") as string | null;
    const position = formData.get("position") as Position | null;
    const font = formData.get("font") as FontFamily | null;
    const color = formData.get("color") as Color | null;
    const size = formData.get("size") as Size | null;
    const output = formData.get("output") as OutputFormat | null;
    const altText = (formData.get("altText") as string | null)?.trim() || null;
    const arrangement = (formData.get("arrangement") as Arrangement | null) || "none";
    const season = (formData.get("season") as string | null) || null;
    const visibility = formData.get("visibility") as string | null;

    // EXIFメタデータ（クライアントが元画像から抽出したものを受け取る）
    // カメラ機種と撮影場所は独立。各オプションごとに保存対象を決める。
    // - cameraOption:   "none" | "show"
    // - locationOption: "none" | "pref" | "city"
    // 注: 撮影日時はプライバシー保護のため現在は取得しない（DBカラム capturedAt は将来用に保持）
    const cameraOption = (formData.get("cameraOption") as string | null) ?? "none";
    const locationOption = (formData.get("locationOption") as string | null) ?? "none";

    let cameraMake: string | null = null;
    let cameraModel: string | null = null;
    const capturedAt: Date | null = null;
    if (cameraOption === "show") {
      cameraMake = (formData.get("cameraMake") as string | null)?.slice(0, 100) || null;
      cameraModel = (formData.get("cameraModel") as string | null)?.slice(0, 100) || null;
    }

    // シーズン（期間限定）: 指定時はスタイル系オプションをプリセットで上書きするため
    // それらの必須チェックを免除し、代わりに期間内かどうかをサーバー側で再検証する
    // （クライアントを信用しない。期間外の投稿は不可）。
    const seasonDef = season ? getSeasonByKey(season) : undefined;
    if (season && !isSeasonActiveNow(season, new Date())) {
      return NextResponse.json(
        { error: "このシーズンは現在利用できません" },
        { status: 400 }
      );
    }

    // バリデーション（season 指定時は position/font/color/size を免除）
    if (!imageBlob || !text || !output || (!season && (!position || !font || !color || !size))) {
      return NextResponse.json(
        { error: "必須パラメータが不足しています" },
        { status: 400 }
      );
    }

    // 値の妥当性検証（/api/v1/generate と同一の制約。直叩きでの制限回避を防ぐ）。
    // 存在チェックだけでは不正な enum や長大テキストがそのまま DB・Fediverse へ流れる。
    if (countGraphemes(text) > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `テキストは${MAX_TEXT_LENGTH}文字以下にしてください` },
        { status: 400 }
      );
    }

    // 代替テキスト（ALT）は Mastodon の description 上限に合わせて1500字まで。
    // （Misskey へ送るときは post.ts が512字に切り詰める）
    if (altText && countGraphemes(altText) > 1500) {
      return NextResponse.json(
        { error: "代替テキストは1500文字以下にしてください" },
        { status: 400 }
      );
    }

    if (!isValidOutput(output)) {
      return NextResponse.json(
        { error: "無効な出力形式が指定されています" },
        { status: 400 }
      );
    }

    // season 指定時はスタイル系をプリセットで上書きするため検証を免除（期間内チェックは上で実施済み）。
    if (!season) {
      if (!isValidPosition(position)) {
        return NextResponse.json(
          { error: "無効な位置が指定されています" },
          { status: 400 }
        );
      }
      if (!isValidFont(font)) {
        return NextResponse.json(
          { error: "無効なフォントが指定されています" },
          { status: 400 }
        );
      }
      if (!isValidColor(color)) {
        return NextResponse.json(
          { error: "無効なカラーが指定されています" },
          { status: 400 }
        );
      }
      if (!isValidSize(size)) {
        return NextResponse.json(
          { error: "無効なサイズが指定されています" },
          { status: 400 }
        );
      }
      if (!isValidArrangement(arrangement)) {
        return NextResponse.json(
          { error: "無効なアレンジが指定されています" },
          { status: 400 }
        );
      }
    }

    // サムネのクロップ位置は実際の描画レイアウトに合わせる（season はプリセット位置）。
    const cropPosition: Position = seasonDef ? seasonDef.preset.position : position ?? DEFAULT_POSITION;

    // ファイルサイズ上限
    if (imageBlob.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `ファイルサイズが${MAX_FILE_SIZE / 1024 / 1024}MBを超えています` },
        { status: 400 }
      );
    }

    // 画像バッファを取得
    const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

    // compute で実フォーマット検出＋寸法＋サムネを取得（クライアント送信の mimeType は信任しない）。
    // R2 が任意の Content-Type で任意コンテンツを配信することを防ぐため、
    // /api/v1/generate の出力形式 (JPEG/AVIF) のみ許可する。
    let finalized;
    try {
      finalized = await finalizeImage(imageBuffer, cropPosition);
    } catch {
      return NextResponse.json(
        { error: "画像の解析に失敗しました" },
        { status: 400 }
      );
    }
    const mimeType = finalized.detectedMime;
    if (!mimeType) {
      return NextResponse.json(
        { error: "サポートされていない画像形式です" },
        { status: 400 }
      );
    }

    // 位置情報: locationOption が pref / city の時だけ保存する。
    // 2経路あり、いずれもクライアント送信の文字列はそのまま信任しない:
    //  (A) 画像にGPS座標あり → サーバー側で再ジオコーディングして権威データを確定。
    //  (B) GPS座標なし（手動指定）→ 送られた都道府県/市町村が「本人の過去投稿に実在する」
    //      ときだけ採用（任意の場所の詐称を防ぐ）。一覧と同じ src/lib/locations.ts で検証。
    let locationPrefecture: string | null = null;
    let locationCity: string | null = null;
    if (locationOption === "pref" || locationOption === "city") {
      const gpsLatRaw = formData.get("gpsLatitude") as string | null;
      const gpsLngRaw = formData.get("gpsLongitude") as string | null;
      const lat = gpsLatRaw != null ? parseFloat(gpsLatRaw) : NaN;
      const lng = gpsLngRaw != null ? parseFloat(gpsLngRaw) : NaN;

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        // (A) GPS座標から逆引き
        const geo = await reverseGeocode(lat, lng);
        if (geo) {
          locationPrefecture = geo.prefecture;
          if (locationOption === "city") {
            locationCity = geo.city;
          }
        }
      } else {
        // (B) 手動指定: 過去投稿に実在する組み合わせのみ採用
        const mPref =
          (formData.get("locationPrefecture") as string | null)?.slice(0, 50) || null;
        const mCity =
          (formData.get("locationCity") as string | null)?.slice(0, 100) || null;
        if (mPref) {
          if (locationOption === "city") {
            if (mCity && (await userHasPostedLocation(user.id, mPref, mCity))) {
              locationPrefecture = mPref;
              locationCity = mCity;
            }
          } else if (await userHasPostedLocation(user.id, mPref, null)) {
            locationPrefecture = mPref;
          }
        }
      }
    }

    // 公開範囲を正規化（フォーム値は null や任意文字列になりうる）
    const publishVisibility = normalizeVisibility(visibility);

    // 保存→投稿（投稿失敗でも画像は残す＝web/email共通ポリシー）
    const result = await publishImage({
      buffer: imageBuffer,
      contentType: mimeType,
      user: {
        id: user.id,
        username: user.username,
        accessToken: decryptToken(user.accessToken),
        instance: { domain: user.instance.domain, type: user.instance.type },
        autoMakeup: user.autoMakeup,
      },
      text,
      altText,
      // 案B（実績は season:null フィルタで隔離）: season 指定時はスタイル列に
      // シーズンのプリセット実値を保存する。これでタイル表示のフォーカス（position）や
      // 拡大率（size）が実際の描画と一致する。実績側は別途 season で除外する。
      options: seasonDef
        ? {
            position: seasonDef.preset.position,
            font: seasonDef.preset.font,
            color: seasonDef.preset.color,
            size: seasonDef.preset.size,
            outputFormat: output,
            arrangement: DEFAULT_ARRANGEMENT,
            season: seasonDef.key,
          }
        : {
            position: position ?? DEFAULT_POSITION,
            font: font ?? DEFAULT_FONT,
            color: color ?? DEFAULT_COLOR,
            size: size ?? DEFAULT_SIZE,
            outputFormat: output,
            arrangement,
            season: null,
          },
      source: "web",
      visibility: publishVisibility,
      persistOnPostFailure: true,
      getThumbnailAndDimensions: async () => ({
        thumbnail: finalized.thumbnail,
        width: finalized.width,
        height: finalized.height,
        blurDataUrl: finalized.blurDataUrl,
      }),
      extras: { cameraMake, cameraModel, capturedAt, locationPrefecture, locationCity },
    });

    // Fediverse投稿だけが失敗したケースは「部分的成功」。
    // 画像はSHAMEZOに保存済み（実績も付与済み）なので 500 ではなく 200 を返し、
    // クライアントは通常どおり画像ページへ遷移して重複投稿を防ぐ。
    // 連合投稿が失敗したことは fediverseError として伝え、警告として表示させる。
    return NextResponse.json({
      success: true,
      imageId: result.imageId,
      imagePageUrl: result.imagePageUrl,
      postUrl: result.postUrl,
      fediverseError: result.postError,
      fediverseErrorStatus: result.postErrorStatus,
      // この投稿で新規獲得した実績（演出用）。キーのみ返し、表示文言はクライアントが解決
      newAchievements: (result.newAchievements ?? []).map((a) => ({
        key: a.key,
        category: a.category,
      })),
    });
  } catch (error) {
    console.error("Post error:", error);
    return NextResponse.json(
      { error: "投稿に失敗しました" },
      { status: 500 }
    );
  }
}
