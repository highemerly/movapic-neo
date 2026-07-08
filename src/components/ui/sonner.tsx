"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // 進捗バー（画面上部）とフィードバック位置を統一するため上部中央に表示。
      // offset はヘッダー（h-12=48px）に被らないよう下げつつ、iOS のノッチ（セーフエリア）分を加算。
      // top のみ指定（単一値だと左右にも効いて横幅が潰れる）。左右は既定の余白のまま。
      position="top-center"
      offset={{ top: "calc(env(safe-area-inset-top, 0px) + 80px)" }}
      mobileOffset={{ top: "calc(env(safe-area-inset-top, 0px) + 80px)" }}
      richColors
      // 全トーストに×ボタンを表示し、ユーザー操作で即時に閉じられるようにする。
      closeButton
      duration={5000}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
