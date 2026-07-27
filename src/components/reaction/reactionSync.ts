"use client";

// リアクション状態を、同一ページ内の複数インスタンスで軽量に同期するための client 専用イベントバス。
//
// 画像詳細ページではリアクションが複数箇所に分かれて描画される:
//   - チップ行（絵文字＋件数、末尾に＋）: 本文の下に1つ
//   - ＋ボタン（ピッカーを開く）: モバイルのフローティングバーに1つ
// これらは別インスタンスなので、片方で操作しても他が更新されずズレる。そこで「操作が成功した側だけ」
// が最新スナップショットを emit し、受信側は state を更新するだけ（emit しない）にする。受信側が emit
// しないので echo ループは起きない。状態の source of truth は各インスタンスのローカル state のまま。
//
// ページを跨いだ永続同期ではなく“同一ページ内の兄弟同期”が目的なので、ストア等は持たず window の
// CustomEvent で十分（SSR ではイベントを張らない）。

export interface ReactionUserInfo {
  acct: string;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
}

export interface ReactionChipInfo {
  emoji: string;
  imageUrl: string | null;
  count: number;
  reactedByViewer: boolean;
}

export interface ReactionSnapshot {
  total: number;
  chips: ReactionChipInfo[];
  usersByEmoji: Record<string, ReactionUserInfo[]>;
  viewerEmoji: string | null;
  statusMessage: string | null;
}

const PREFIX = "shamezo:reaction:";

/** 変更した側が最新スナップショットを同ページの他インスタンスへ通知する。 */
export function emitReaction(imageId: string, snapshot: ReactionSnapshot) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PREFIX + imageId, { detail: snapshot }));
}

/** 他インスタンスの変更を購読する。返り値で解除。受信ハンドラ内では emit しないこと（echo防止）。 */
export function subscribeReaction(
  imageId: string,
  onSnapshot: (snapshot: ReactionSnapshot) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) =>
    onSnapshot((event as CustomEvent<ReactionSnapshot>).detail);
  window.addEventListener(PREFIX + imageId, handler);
  return () => window.removeEventListener(PREFIX + imageId, handler);
}

/** API レスポンス（GET/PUT/DELETE 共通）をスナップショットに直す。 */
export function toSnapshot(data: {
  total?: number;
  chips?: ReactionChipInfo[];
  usersByEmoji?: Record<string, ReactionUserInfo[]>;
  viewerEmoji?: string | null;
  syncError?: string | null;
}): ReactionSnapshot {
  return {
    total: data.total ?? 0,
    chips: data.chips ?? [],
    usersByEmoji: data.usersByEmoji ?? {},
    viewerEmoji: data.viewerEmoji ?? null,
    statusMessage: data.syncError ?? null,
  };
}
