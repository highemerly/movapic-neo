"use client";

import { useEffect } from "react";
import { initInstallCapture } from "@/lib/pwa/install";

/**
 * Service Worker（/sw.js）を登録するクライアントコンポーネント。
 * あわせて PWA インストール用の beforeinstallprompt 捕捉も早期に開始する
 * （イベントはアプリ起動直後に1度だけ飛ぶことがあるため、レイアウトで捕捉しておく）。
 * SW登録は非対応ブラウザや非secureコンテキスト（http://のLAN等）では何もしない。
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    // インストール導線用のイベント捕捉（SWの有無に関わらず開始）
    initInstallCapture();

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
