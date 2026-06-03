"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

/**
 * ログイン中のユーザーがいれば、DBに保存された displayMode を
 * next-themes 側（localStorage）に同期する。
 * 端末をまたいで設定を一致させる目的。
 */
export function ThemeSync() {
  const { setTheme, theme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const remote = data?.user?.displayMode as string | undefined;
        if (!remote) return;
        if (remote === theme) return;
        setTheme(remote);
      })
      .catch(() => {
        // 失敗はサイレント（localStorage の現状値を尊重）
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
