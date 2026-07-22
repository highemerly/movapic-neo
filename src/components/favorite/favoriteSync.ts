"use client";

// お気に入り状態を、同一ページ内の複数インスタンスで軽量に同期するための client 専用イベントバス。
//
// 画像詳細ページではお気に入りが複数箇所に分かれて描画される:
//   - トグル（ハート＋数）: PCインライン行とモバイルのフローティングに1つずつ（CSSで出し分け・両方マウント）
//   - お気に入り者アイコン列（FavoriteAvatarsLive）: 本文内に1つ
// これらは別インスタンスなので、片方でトグルしても他が更新されずズレる。そこで「操作が成功した側だけ」
// が最新スナップショットを emit し、受信側は state を更新するだけ（emit しない）にする。受信側が emit
// しないので echo ループは起きない。状態の source of truth は各インスタンスのローカル state のまま。
//
// ページを跨いだ永続同期ではなく“同一ページ内の兄弟同期”が目的なので、ストア等は持たず window の
// CustomEvent で十分（SSR ではイベントを張らない）。

export interface FavoriterInfo {
  acct: string;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
}

export interface FavoriteSnapshot {
  count: number;
  isFavorited: boolean;
  favoriters: FavoriterInfo[];
  statusMessage: string | null;
}

const PREFIX = "shamezo:favorite:";

/** 変更した側が最新スナップショットを同ページの他インスタンスへ通知する。 */
export function emitFavorite(imageId: string, snap: FavoriteSnapshot) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PREFIX + imageId, { detail: snap }));
}

/** 他インスタンスの変更を購読する。返り値で解除。受信ハンドラ内では emit しないこと（echo防止）。 */
export function subscribeFavorite(
  imageId: string,
  onSnapshot: (snap: FavoriteSnapshot) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) =>
    onSnapshot((e as CustomEvent<FavoriteSnapshot>).detail);
  window.addEventListener(PREFIX + imageId, handler);
  return () => window.removeEventListener(PREFIX + imageId, handler);
}
