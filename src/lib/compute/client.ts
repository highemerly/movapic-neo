/**
 * compute（画像生成専用サービス）への内部クライアント。
 *
 * worker-front 側のコード（generate/post route, queue tasks, mention processor）は
 * sharp/skia を直接呼ばず、本クライアント経由で compute に処理を委譲する。
 * compute はステートレス（バイト入出力のみ・R2/DBに触れない）。
 */

import type { ProcessImageResult } from "@/lib/image";
import type {
  Position,
  FontFamily,
  Color,
  Size,
  OutputFormat,
  Arrangement,
} from "@/types";

const COMPUTE_TIMEOUT_MS = 25000;

function computeBase(): string {
  const url = process.env.COMPUTE_SERVICE_URL;
  if (!url) {
    throw new Error("COMPUTE_SERVICE_URL is not set");
  }
  return url.replace(/\/+$/, "");
}

function computeApiKey(): string {
  const key = process.env.COMPUTE_API_KEY;
  if (!key) {
    throw new Error("COMPUTE_API_KEY is not set");
  }
  return key;
}

async function computeFetch(path: string, form: FormData): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COMPUTE_TIMEOUT_MS);
  try {
    return await fetch(`${computeBase()}${path}`, {
      method: "POST",
      headers: { "X-API-Key": computeApiKey() },
      body: form,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function bufferToBlob(buffer: Buffer): Blob {
  return new Blob([new Uint8Array(buffer)]);
}

export interface RenderImageParams {
  imageBuffer: Buffer;
  text: string;
  position: Position;
  color: Color;
  size: Size;
  font: FontFamily;
  output: OutputFormat;
  arrangement: Arrangement;
  requestId?: string;
}

/** 文字入れ画像を compute で生成する（processImage 相当）。 */
export async function renderImage(
  p: RenderImageParams
): Promise<ProcessImageResult> {
  const form = new FormData();
  form.append("image", bufferToBlob(p.imageBuffer), "image");
  form.append("text", p.text);
  form.append("position", p.position);
  form.append("color", p.color);
  form.append("size", p.size);
  form.append("font", p.font);
  form.append("output", p.output);
  form.append("arrangement", p.arrangement);
  if (p.requestId) form.append("requestId", p.requestId);

  const res = await computeFetch("/api/internal/render", form);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`compute render failed: ${res.status} ${body}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    buffer,
    contentType: res.headers.get("Content-Type") ?? "application/octet-stream",
    extension: res.headers.get("X-Extension") ?? "jpg",
    originalWidth: parseInt(res.headers.get("X-Original-Width") ?? "0", 10),
    originalHeight: parseInt(res.headers.get("X-Original-Height") ?? "0", 10),
  };
}

export interface FinalizeResult {
  thumbnail: Buffer;
  /** JPEG/AVIF のときのみ設定。未対応形式は undefined（呼び出し側で拒否） */
  detectedMime?: string;
  width: number;
  height: number;
}

/** 最終画像の mime 判定＋寸法＋サムネを compute で得る。 */
export async function finalizeImage(
  imageBuffer: Buffer,
  position: Position
): Promise<FinalizeResult> {
  const form = new FormData();
  form.append("image", bufferToBlob(imageBuffer), "image");
  form.append("position", position);

  const res = await computeFetch("/api/internal/finalize", form);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`compute finalize failed: ${res.status} ${body}`);
  }

  const thumbnail = Buffer.from(await res.arrayBuffer());
  const detected = res.headers.get("X-Detected-Mime") ?? "";
  return {
    thumbnail,
    detectedMime: detected || undefined,
    width: parseInt(res.headers.get("X-Width") ?? "0", 10),
    height: parseInt(res.headers.get("X-Height") ?? "0", 10),
  };
}
