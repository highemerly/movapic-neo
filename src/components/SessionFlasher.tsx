"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { FlashToast } from "@/components/ToastFlasher";

/**
 * sessionStorage を経由してページ遷移後に一度だけ sonner トーストを発火する。
 *
 * ToastFlasher（クエリパラメータ方式）はソフト遷移（router.push）向け。
 * ログアウトのように window.location.href でフルリロードして着地するケースでは、
 * クエリ + replaceState だと着地直後の URL 書き換えで見た目が「即 / に遷移」となり
 * 挙動が分かりづらいうえ、URL に一瞬フラグが露出する。
 * そこで発火元が sessionStorage に FlashToast(JSON) を積み、着地ページのこのコンポーネントが
 * マウント時に読み出して発火→即削除する（リロードで再表示されない）。
 *
 * pitfall: sonner の <Toaster> は初期 state が空で、自身の useEffect で購読して以降に
 * 来たトーストしか描画しない（購読前の toast() は取りこぼす）。フルリロードでは Toaster と
 * このコンポーネントが同時に新規マウントし、React の effect は子（本コンポーネント）が
 * 後続の兄弟（Toaster）より先に走るため、即 toast() すると Toaster 購読前で消える。
 * そのため toast() は setTimeout(0) で effect フラッシュ後（＝Toaster 購読後）に回す。
 */
export function SessionFlasher({ storageKey }: { storageKey: string }) {
  const fired = useRef(false);

  useEffect(() => {
    // StrictMode の二重実行で二度読まないようガード（ref はマウント跨ぎで保持される）。
    if (fired.current) return;
    fired.current = true;

    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return;
    sessionStorage.removeItem(storageKey);

    let flash: FlashToast;
    try {
      flash = JSON.parse(raw) as FlashToast;
    } catch {
      return;
    }

    // Toaster の購読 effect より後に発火させる（pitfall はコンポーネント冒頭参照）。
    setTimeout(() => {
      toast[flash.variant](flash.message, {
        description: flash.description,
        duration: flash.duration,
      });
    }, 0);
  }, [storageKey]);

  return null;
}
