"use client";

// ピン留め状態を、同一ページ内の複数のミートボールメニューで同期する client 専用イベントバス。
//
// 画像詳細ページはミートボール（ImageActionsMenu）を3箇所に出す:
//   - 上部の「◯◯に戻る」行の右端（PC・モバイル共通）
//   - 投稿者カードの右の「その他」カード（PCのみ）
//   - 下部フローティングバー（モバイルのみ）
// いずれも同じコンポーネントの別インスタンスで、それぞれが自前の isPinned state を持つ。そのため
// 片方でピン留めしても他方は「ピン留め」のままでズレる（PC・モバイルとも常時2つ見えている）。
//
// pitfall: router.refresh() では直らない。サーバー側を再取得しても client component はマウントされた
// ままなので、useState の初期値（initialIsPinned）は二度と再適用されない。
//
// そこで reactionSync と同じ方式を採る。操作した側だけが emit し、受信側は state を更新するだけ
// （emit しない）＝echo ループは起きない。source of truth は各インスタンスのローカル state のまま。

const PREFIX = "shamezo:pin:";

/** ピン留めを切り替えた側が、同ページの他インスタンスへ最新状態を通知する。 */
export function emitPinned(imageId: string, isPinned: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PREFIX + imageId, { detail: isPinned }));
}

/** 他インスタンスの変更を購読する。返り値で解除。受信ハンドラ内では emit しないこと（echo防止）。 */
export function subscribePinned(
  imageId: string,
  onChange: (isPinned: boolean) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) =>
    onChange((event as CustomEvent<boolean>).detail);
  window.addEventListener(PREFIX + imageId, handler);
  return () => window.removeEventListener(PREFIX + imageId, handler);
}
