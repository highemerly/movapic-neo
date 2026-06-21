"use client";

import { useState, useSyncExternalStore } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import Link from "@/components/Link";
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

// 「ログイン履歴を確認する」と同じ行デザイン
const ROW_CLASS =
  "flex items-center justify-between gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors";

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

  if (showIos) {
    return (
      <Link href="/dashboard/install" className={ROW_CLASS}>
        <div className="flex-1 min-w-0">
          <p className="text-sm">ホーム画面に追加する</p>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      </Link>
    );
  }

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
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`${ROW_CLASS} w-full text-left disabled:opacity-60`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm">アプリをインストールする</p>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
    </button>
  );
}
