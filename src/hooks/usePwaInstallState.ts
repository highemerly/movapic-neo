"use client";

import { useSyncExternalStore } from "react";
import {
  subscribeInstall,
  getCanInstall,
  detectPwaPlatform,
  isStandaloneDisplay,
  type PwaPlatform,
} from "@/lib/pwa/install";

// 値が変化しない購読（プラットフォーム/standalone は実行中ほぼ不変）
const noopSubscribe = () => () => {};

/**
 * PWAインストール導線の共通判定（設定ページの [InstallEntry] と投稿後の [InstallSuggestModal] で共用）。
 * サーバー/初回描画では出さず、hydration 後に判定する（getServerSnapshot で SSR 安全）。
 */
export function usePwaInstallState(): {
  platform: PwaPlatform;
  standalone: boolean;
  canInstall: boolean;
} {
  const platform = useSyncExternalStore<PwaPlatform>(
    noopSubscribe,
    detectPwaPlatform,
    () => "other",
  );
  const standalone = useSyncExternalStore(
    noopSubscribe,
    isStandaloneDisplay,
    () => false,
  );
  const canInstall = useSyncExternalStore(
    subscribeInstall,
    getCanInstall,
    () => false,
  );
  return { platform, standalone, canInstall };
}
