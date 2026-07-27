"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { SettingLinkRow, SettingActionRow } from "@/components/SettingRow";
import { usePwaInstallState } from "@/hooks/usePwaInstallState";
import { triggerInstall } from "@/lib/pwa/install";

/**
 * 設定ページの最下部に置く、控えめなインストール導線。
 *
 * - **iOS Safari**: 説明用の専用ページ（/settings/install）へ遷移するリンク。
 * - **Android（インストール可能なとき）**: タップで beforeinstallprompt を発火（行ボタン）。
 * - デスクトップ／インストール済み／Android非対応時は何も出さない。
 *
 * サーバー/初回描画では出さず、マウント後に判定（[usePwaInstallState]）。
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
        href="/settings/install"
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
