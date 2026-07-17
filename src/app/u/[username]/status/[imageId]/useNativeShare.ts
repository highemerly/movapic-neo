"use client";

import { useCallback, useSyncExternalStore } from "react";

// navigator.share 対応端末でのみ表示する（Web Share API はセキュアコンテキスト＝
// HTTPS / localhost でのみ有効）。デザイン確認時のみ true にして非対応端末でも出せる。
export const FORCE_SHOW_NATIVE_SHARE = false;

export interface NativeShareParams {
  /** 共有する生成画像のURL（S3公開URL） */
  imageUrl: string;
  /** 画像のMIME（拡張子推定とFile生成に使用） */
  mimeType: string;
  /** 添付ファイル名のベース（拡張子なし） */
  fileBaseName: string;
  /** 共有本文（コメント） */
  text: string;
  /** 共有するページURL */
  url: string;
}

function extFromMime(mime: string): string {
  if (mime.includes("avif")) return "avif";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("png")) return "png";
  return "jpg";
}

/**
 * スマホOSのネイティブ共有シート（Web Share API）を扱う共通フック。
 * - supported: navigator.share 対応か（マウント後に判定）。
 * - visible: 実際に表示してよいか（FORCE_SHOW_NATIVE_SHARE 中は常に true）。
 * - share(): 画像ファイルも添付して共有。CORS等で画像が取れなければ URL＋テキストのみ。
 *   ※ Web Share API はセキュアコンテキスト（HTTPS / localhost）でのみ有効。
 */
export function useNativeShare({
  imageUrl,
  mimeType,
  fileBaseName,
  text,
  url,
}: NativeShareParams) {
  // マウント後にのみ navigator.share を判定（SSR では false）。setState-in-effect を避け、
  // サーバー/クライアントのスナップショットを分けて hydration 不整合も回避する。
  const supported = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );

  const share = useCallback(async () => {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      // 非対応環境（デザイン確認のために表示しているだけ）では何もしない
      return;
    }
    let files: File[] | undefined;
    try {
      const res = await fetch(imageUrl);
      if (res.ok) {
        const blob = await res.blob();
        const type = blob.type || mimeType;
        const file = new File([blob], `${fileBaseName}.${extFromMime(type)}`, { type });
        if (navigator.canShare?.({ files: [file] })) files = [file];
      }
    } catch {
      // CORS／ネットワーク失敗時は画像なしで共有する
    }
    try {
      await navigator.share(files ? { files, text, url } : { text, url });
    } catch {
      // ユーザーキャンセル（AbortError）等は無視
    }
  }, [imageUrl, mimeType, fileBaseName, text, url]);

  return { supported, visible: supported || FORCE_SHOW_NATIVE_SHARE, share };
}
