import { NextRequest, NextResponse } from "next/server";
import { processImage } from "@/lib/imageProcessor";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import {
  Position,
  FontFamily,
  Color,
  Size,
  OutputFormat,
  Arrangement,
  MAX_TEXT_LENGTH,
  MAX_FILE_SIZE,
  ALLOWED_FILE_TYPES,
  isValidPosition,
  isValidFont,
  isValidColor,
  isValidSize,
  isValidOutput,
  isValidArrangement,
} from "@/types";
import {
  ErrorCodes,
  ImageProcessError,
  errorResponse,
  handleImageProcessError,
  handleUnknownError,
} from "@/lib/errors";

// 画像処理のタイムアウト（ミリ秒）
const PROCESS_TIMEOUT_MS = 21000;

/**
 * タイムアウト付きでPromiseを実行する
 */
function withTimeout<T>(promise: Promise<T>, ms: number, requestId: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new ImageProcessError("タイムアウト", "composite", requestId)), ms)
    ),
  ]);
}

export async function POST(request: NextRequest) {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // レート制限チェック
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(clientIp);

  if (!rateLimit.allowed) {
    return errorResponse(
      ErrorCodes.RATE_LIMIT,
      "リクエストが多すぎます",
      429,
      {
        suggestion: `${rateLimit.retryAfter}秒後に再試行してください`,
        requestId,
        headers: { "Retry-After": String(rateLimit.retryAfter) },
      }
    );
  }

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
    const arrangement = (formData.get("arrangement") as Arrangement | null) || "none";

    // バリデーション
    if (!image) {
      return errorResponse(
        ErrorCodes.VALIDATION_REQUIRED,
        "画像は必須です",
        400,
        { requestId }
      );
    }

    // HEICファイルはMIMEタイプが空や不正な場合があるので、拡張子でもチェック
    const fileName = image.name.toLowerCase();
    const isHEICFile = fileName.endsWith(".heic") || fileName.endsWith(".heif");
    const isValidType = ALLOWED_FILE_TYPES.includes(image.type) || isHEICFile;

    if (!isValidType) {
      return errorResponse(
        ErrorCodes.VALIDATION_FILE_TYPE,
        "JPEG、PNG、WebP、HEIC、AVIF形式のみ対応しています",
        400,
        { requestId }
      );
    }

    if (image.size > MAX_FILE_SIZE) {
      return errorResponse(
        ErrorCodes.VALIDATION_FILE_TOO_LARGE,
        "ファイルサイズは20MB以下にしてください",
        400,
        {
          suggestion: "画像を圧縮してください",
          requestId,
        }
      );
    }

    if (!text || text.trim().length === 0) {
      return errorResponse(
        ErrorCodes.VALIDATION_REQUIRED,
        "テキストを入力してください",
        400,
        { requestId }
      );
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return errorResponse(
        ErrorCodes.VALIDATION_TOO_LONG,
        `テキストは${MAX_TEXT_LENGTH}文字以下にしてください`,
        400,
        { requestId }
      );
    }

    if (!isValidPosition(position)) {
      return errorResponse(
        ErrorCodes.VALIDATION_INVALID,
        "無効な位置が指定されています",
        400,
        { requestId }
      );
    }

    if (!isValidFont(font)) {
      return errorResponse(
        ErrorCodes.VALIDATION_INVALID,
        "無効なフォントが指定されています",
        400,
        { requestId }
      );
    }

    if (!isValidColor(color)) {
      return errorResponse(
        ErrorCodes.VALIDATION_INVALID,
        "無効なカラーが指定されています",
        400,
        { requestId }
      );
    }

    if (!isValidSize(size)) {
      return errorResponse(
        ErrorCodes.VALIDATION_INVALID,
        "無効なサイズが指定されています",
        400,
        { requestId }
      );
    }

    if (!isValidOutput(output)) {
      return errorResponse(
        ErrorCodes.VALIDATION_INVALID,
        "無効な出力形式が指定されています",
        400,
        { requestId }
      );
    }

    if (!isValidArrangement(arrangement)) {
      return errorResponse(
        ErrorCodes.VALIDATION_INVALID,
        "無効なアレンジが指定されています",
        400,
        { requestId }
      );
    }

    // 画像処理（タイムアウト付き）
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const fileSizeKB = Math.round(imageBuffer.length / 1024);
    const fileExt = fileName.split('.').pop()?.toLowerCase() || 'unknown';
    const originalFileSize = imageBuffer.length;
    // 元画像の形式（拡張子ベース、HEICはMIMEタイプが不正な場合があるため）
    const originalFormat = fileExt.toUpperCase();

    console.log(`[generate] rid=${requestId} REQUEST: file=${fileName}, size=${fileSizeKB}KB, ext=${fileExt}, mimeType=${image.type || 'empty'}`);

    const startTime = performance.now();
    const result = await withTimeout(
      processImage({
        imageBuffer,
        text,
        position,
        color,
        size,
        font,
        output,
        arrangement,
        requestId,
      }),
      PROCESS_TIMEOUT_MS,
      requestId
    );

    // 画像を返す（Content-Lengthヘッダーを含む）
    const processingTime = Math.round(performance.now() - startTime);
    console.log(`[generate] rid=${requestId} SUCCESS: outputSize=${Math.round(result.buffer.length / 1024)}KB, type=${result.contentType}, time=${processingTime}ms`);
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.buffer.length),
        "Content-Disposition": `inline; filename="generated.${result.extension}"`,
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
        "X-Processing-Time": String(processingTime),
        "X-Original-File-Size": String(originalFileSize),
        "X-Original-Format": originalFormat,
        "X-Original-Width": String(result.originalWidth || 0),
        "X-Original-Height": String(result.originalHeight || 0),
      },
    });
  } catch (error) {
    // 画像処理エラー（ステージ別）
    if (error instanceof ImageProcessError) {
      console.error(`[generate] rid=${requestId} IMAGE_PROCESS_ERROR: stage=${error.stage}, message=${error.message}`);
      return handleImageProcessError(error);
    }

    return handleUnknownError(error, requestId);
  }
}
