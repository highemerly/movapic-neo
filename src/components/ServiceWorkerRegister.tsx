"use client";

import { useEffect } from "react";

/**
 * Service Worker（/sw.js）を登録するだけのクライアントコンポーネント。
 * 役割は Web Share Target（他アプリからの画像共有受信）の有効化のみ。
 * 非対応ブラウザや非secureコンテキスト（http://のLAN等）では何もしない。
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("[sw] registration failed:", err);
      });
    };

    // 初期描画のリソース取得と競合しないよう load 後に登録
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
