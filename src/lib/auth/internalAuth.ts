/**
 * 内部サービス間認証のユーティリティ
 */

import { timingSafeEqual } from "crypto";

/**
 * タイミング攻撃に耐性のある文字列比較。
 * 長さが異なる場合は（timingSafeEqual が例外を投げるのを避けて）false を返す。
 * X-API-Key の検証などに使う。
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}
