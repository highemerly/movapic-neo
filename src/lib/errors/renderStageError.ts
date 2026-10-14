/**
 * compute の /api/internal/render が画像処理の段階エラー（ImageProcessError）を返すときの取り決め。
 *
 * compute とは HTTP 越しなので例外の型が渡らない。stage と文言を JSON で返し、
 * worker-front 側（compute/client.ts）で ImageProcessError に戻して generate の
 * handleImageProcessError に届ける。
 */

import type { ProcessStage } from "./AppError";

/** 段階エラーの応答ステータス。汎用の失敗（500）と区別するために専用の値を使う */
export const RENDER_STAGE_ERROR_STATUS = 422;

const STAGES: readonly ProcessStage[] = ["rotate", "resize", "overlay", "composite", "convert"];

/** 応答本文を読み、取り決めどおりなら stage と文言を返す。形が違えば null（汎用の失敗として扱う） */
export function parseRenderStageError(
  body: string
): { stage: ProcessStage; message: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { stage, message } = parsed as { stage?: unknown; message?: unknown };
  if (typeof message !== "string" || message === "") return null;
  if (!STAGES.includes(stage as ProcessStage)) return null;
  return { stage: stage as ProcessStage, message };
}
