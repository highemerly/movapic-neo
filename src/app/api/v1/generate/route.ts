import { NextRequest, NextResponse } from "next/server";
import { processImage } from "@/lib/imageProcessor";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import {
  Position,
  FontFamily,
  Color,
  Size,
  OutputFormat,
  MAX_TEXT_LENGTH,
  MAX_FILE_SIZE,
  ALLOWED_FILE_TYPES,
} from "@/types";

const VALID_POSITIONS: Position[] = ["top", "right", "left", "bottom"];
const VALID_FONTS: FontFamily[] = ["hui-font", "noto-sans-jp", "light-novel-pop"];
const VALID_COLORS: Color[] = [
  "white",
  "red",
  "blue",
  "green",
  "yellow",
  "brown",
  "pink",
  "orange",
];
const VALID_SIZES: Size[] = ["small", "medium", "large"];
const VALID_OUTPUT_FORMATS: OutputFormat[] = ["mastodon", "misskey", "none"];

// 画像処理のタイムアウト（ミリ秒）
const PROCESS_TIMEOUT_MS = 21000;

/**
 * タイムアウト付きでPromiseを実行する
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("処理がタイムアウトしました")), ms)
    ),
  ]);
}

export async function POST(request: NextRequest) {
  // レート制限チェック
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(clientIp);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `リクエストが多すぎます。${rateLimit.retryAfter}秒後に再試行してください` },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfter),
        },
      }
    );
  }

  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  try {
    const formData = await request.formData();

    // パラメータの取得
    const image = formData.get("image") as File | null;
    const text = formData.get("text") as string | null;
    const position = formData.get("position") as Position | null;
    const font = formData.get("font") as FontFamily | null;
    const color = formData.get("color") as Color | null;
    const size = formData.get("size") as Size | null;
    const output = formData.get("output") as OutputFormat | null;

    // バリデーション
    if (!image) {
      return NextResponse.json({ error: "画像は必須です" }, { status: 400 });
    }

    // HEICファイルはMIMEタイプが空や不正な場合があるので、拡張子でもチェック
    const fileName = image.name.toLowerCase();
    const isHEICFile = fileName.endsWith(".heic") || fileName.endsWith(".heif");
    const isValidType = ALLOWED_FILE_TYPES.includes(image.type) || isHEICFile;

    if (!isValidType) {
      return NextResponse.json(
        { error: "JPEG、PNG、WebP、HEIC、AVIF形式のみ対応しています" },
        { status: 400 }
      );
    }

    if (image.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "ファイルサイズは25MB以下にしてください" },
        { status: 400 }
      );
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "テキストを入力してください" },
        { status: 400 }
      );
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `テキストは${MAX_TEXT_LENGTH}文字以下にしてください` },
        { status: 400 }
      );
    }

    if (!position || !VALID_POSITIONS.includes(position)) {
      return NextResponse.json(
        { error: "無効な位置が指定されています" },
        { status: 400 }
      );
    }

    if (!font || !VALID_FONTS.includes(font)) {
      return NextResponse.json(
        { error: "無効なフォントが指定されています" },
        { status: 400 }
      );
    }

    if (!color || !VALID_COLORS.includes(color)) {
      return NextResponse.json(
        { error: "無効なカラーが指定されています" },
        { status: 400 }
      );
    }

    if (!size || !VALID_SIZES.includes(size)) {
      return NextResponse.json(
        { error: "無効なサイズが指定されています" },
        { status: 400 }
      );
    }

    if (!output || !VALID_OUTPUT_FORMATS.includes(output)) {
      return NextResponse.json(
        { error: "無効な出力形式が指定されています" },
        { status: 400 }
      );
    }

    // 画像処理（タイムアウト付き）
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const fileSizeKB = Math.round(imageBuffer.length / 1024);
    const fileExt = fileName.split('.').pop()?.toLowerCase() || 'unknown';

    console.log(`[generate] rid=${requestId} REQUEST: file=${fileName}, size=${fileSizeKB}KB, ext=${fileExt}, mimeType=${image.type || 'empty'}`);

    const result = await withTimeout(
      processImage({
        imageBuffer,
        text,
        position,
        color,
        size,
        font,
        output,
        requestId,
      }),
      PROCESS_TIMEOUT_MS
    );

    // 画像を返す（Content-Lengthヘッダーを含む）
    console.log(`[generate] rid=${requestId} SUCCESS: outputSize=${Math.round(result.buffer.length / 1024)}KB, type=${result.contentType}`);
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.buffer.length),
        "Content-Disposition": `inline; filename="generated.${result.extension}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // タイムアウトエラーの場合は専用メッセージを返す
    if (error instanceof Error && error.message === "処理がタイムアウトしました") {
      console.error(`[generate] rid=${requestId} TIMEOUT: exceeded ${PROCESS_TIMEOUT_MS}ms`);
      return NextResponse.json(
        { error: "画像の処理に時間がかかりすぎました。画像サイズを小さくして再試行してください" },
        { status: 504 }
      );
    }

    console.error(`[generate] rid=${requestId} ERROR:`, error);

    return NextResponse.json(
      { error: "画像の生成に失敗しました" },
      { status: 500 }
    );
  }
}
