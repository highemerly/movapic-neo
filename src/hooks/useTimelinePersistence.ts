"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * タイムライン一覧を sessionStorage に保存し、ハードリロード（PWA の pull-to-refresh /
 * F5）後に「スクロール済みの一覧＋位置」を復元するためのフック。
 *
 * なぜ必要か: ハードリロードは JS 状態を捨てるため、SSR が返す先頭ページ（最新20件）
 * しか残らない。スクロールして読み込んだ続きは失われ、再スクロールで全画像を取り直す。
 * iOS Safari / PWA は画像キャッシュが持たないので、これが「全データ取り直し」体感になる。
 * 復元した一覧の先頭 id で差分だけ取れば、離席中の新着も取り込みつつ再取得を避けられる。
 *
 * useInfiniteImages に restore（マウント後に一度適用）と onChange（変更保存）を渡して使う。
 */

const TTL_MS = 10 * 60 * 1000; // これより古いスナップショットは無視（削除済み項目の残留を抑える）
const MAX_ITEMS = 200; // sessionStorage サイズ上限対策。超過分は捨てる（続きは無限スクロールで再取得）
const SAVE_DEBOUNCE_MS = 500;

interface Snapshot<T> {
  items: T[];
  nextCursor: string | null;
  scrollY: number;
  savedAt: number;
}

interface TimelinePersistence<T> {
  restore: () => { images: T[]; nextCursor: string | null } | null;
  onChange: (images: T[], nextCursor: string | null) => void;
}

export function useTimelinePersistence<T extends { id: string }>(
  key: string
): TimelinePersistence<T> {
  // onChange で受けた最新状態。scroll/pagehide 由来の保存でも同じ内容を書けるよう ref に持つ。
  const stateRef = useRef<{ images: T[]; nextCursor: string | null }>({
    images: [],
    nextCursor: null,
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const write = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const snap: Snapshot<T> = {
        items: stateRef.current.images.slice(0, MAX_ITEMS),
        nextCursor: stateRef.current.nextCursor,
        scrollY: window.scrollY,
        savedAt: Date.now(),
      };
      sessionStorage.setItem(key, JSON.stringify(snap));
    } catch {
      // QuotaExceeded 等は握りつぶす（永続化は best-effort。失敗しても通常動作は維持）。
    }
  }, [key]);

  const scheduleWrite = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(write, SAVE_DEBOUNCE_MS);
  }, [write]);

  const restore = useCallback((): {
    images: T[];
    nextCursor: string | null;
  } | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const snap = JSON.parse(raw) as Snapshot<T>;
      if (!snap?.items?.length) return null;
      if (Date.now() - snap.savedAt > TTL_MS) {
        sessionStorage.removeItem(key);
        return null;
      }
      // レイアウト確定後にスクロール復元する。masonry は幅計測後に高さが決まるため、
      // 目標位置までスクロールできる高さが揃うまで数フレーム待ってから scrollTo する。
      restoreScroll(snap.scrollY);
      return { images: snap.items, nextCursor: snap.nextCursor };
    } catch {
      return null;
    }
  }, [key]);

  const onChange = useCallback(
    (images: T[], nextCursor: string | null) => {
      stateRef.current = { images, nextCursor };
      scheduleWrite();
    },
    [scheduleWrite]
  );

  // 離脱直前（reload / 背面化）に確定保存する。scroll だけでは onChange が発火しないため、
  // ここで最新のスクロール位置を書き込む。pagehide は iOS Safari でも発火する。
  useEffect(() => {
    if (typeof window === "undefined") return;

    // App Router の自動スクロール復元と競合しないよう手動化する。
    const prevRestoration = history.scrollRestoration;
    try {
      history.scrollRestoration = "manual";
    } catch {
      // 一部環境で setter が無い場合は無視。
    }

    const onHide = () => write();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") write();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      try {
        history.scrollRestoration = prevRestoration;
      } catch {
        // 同上。
      }
    };
  }, [write]);

  return { restore, onChange };
}

/**
 * 目標 Y までスクロールできる高さが揃うまで数フレーム待ってから復元する。
 * masonry / 画像枠の aspect-ratio 確定が非同期のため、即時 scrollTo だと下端で止まる。
 */
function restoreScroll(y: number): void {
  if (y <= 0) return;
  let tries = 0;
  const attempt = () => {
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    if (y <= maxY || tries++ > 20) {
      window.scrollTo(0, y);
      return;
    }
    requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
}
