import { useSyncExternalStore, useCallback } from "react";

/**
 * 写真一覧の表示レイアウト。閲覧者ごとの好み（ブラウザローカル）で、
 * public / お気に入り / ユーザーページの全一覧で共有する。
 * - "grid": 正方形タイル（既定・トリミングあり）
 * - "packed": トリミングなしで隙間なく敷き詰める（Justified rows）
 */
export type GalleryLayout = "grid" | "packed";

const STORAGE_KEY = "gallery-layout";
// 同一タブ内の別コンポーネントへ即時反映するための独自イベント
// （storage イベントは別タブにしか飛ばないため併用する）
const CHANGE_EVENT = "gallery-layout-change";

function getSnapshot(): GalleryLayout {
  if (typeof window === "undefined") return "grid";
  return window.localStorage.getItem(STORAGE_KEY) === "packed" ? "packed" : "grid";
}

function getServerSnapshot(): GalleryLayout {
  return "grid";
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/**
 * 現在のレイアウトと setter を返す。
 * useSyncExternalStore により SSR/初回描画は "grid"、hydration 後に
 * localStorage の値へ切り替わる（hydration mismatch なし）。
 */
export function useGalleryLayout(): [GalleryLayout, (next: GalleryLayout) => void] {
  const layout = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLayout = useCallback((next: GalleryLayout) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [layout, setLayout];
}
