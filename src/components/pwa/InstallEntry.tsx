"use client";

import { useState, useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { SettingLinkRow, SettingActionRow } from "@/components/SettingRow";
import {
  subscribeInstall,
  getCanInstall,
  triggerInstall,
  detectPwaPlatform,
  isStandaloneDisplay,
  type PwaPlatform,
} from "@/lib/pwa/install";

// 値が変化しない購読（プラットフォーム/standalone は実行中ほぼ不変）
const noopSubscribe = () => () => {};

function usePwaInstallState() {
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

/**
 * dashboard「設定を変更する → 一般」の最下部に置く、控えめなインストール導線。
 *
 * - **iOS Safari**: 説明用の専用ページ（/dashboard/install）へ遷移するリンク。
 * - **Android（インストール可能なとき）**: タップで beforeinstallprompt を発火（行ボタン）。
 * - デスクトップ／インストール済み／Android非対応時は何も出さない。
 *
 * サーバー/初回描画では出さず、マウント後に判定（useSyncExternalStore の
 * getServerSnapshot で SSR 安全）。
 */
export function InstallEntry() {
  const { platform, standalone, canInstall } = usePwaInstallState();

  if (standalone) return null; // インストール済み
  const showAndroid = platform === "android" && canInstall;
  const showIos = platform === "ios-safari";

  // iOS Safari: 手順説明ページへ遷移（link）
  if (showIos) {
    return (
      <SettingLinkRow
        href="/dashboard/install"
        title="ホーム画面に追加する"
        description="アプリのように起動できます。"
      />
    );
  }

  // Android: その場で beforeinstallprompt を発火（action）
  if (showAndroid) {
    return <AndroidInstallRow />;
  }

  return null;
}

function AndroidInstallRow() {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    const result = await triggerInstall();
    setBusy(false);
    if (result === "dismissed") {
      toast.info("インストールをキャンセルしました");
    } else if (result === "unavailable") {
      toast.error("この端末では今すぐインストールできません");
    }
    // accepted のときは appinstalled で行自体が消える
  };

  return (
    <SettingActionRow
      title="アプリをインストールする"
      description="アプリのように起動できます。"
      icon={Download}
      busy={busy}
      disabled={busy}
      onClick={handleClick}
    />
  );
}
