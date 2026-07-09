"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { useIsHydrated } from "@/hooks/useIsHydrated";

type Mode = "system" | "light" | "dark";

const OPTIONS: { value: Mode; label: string; Icon: typeof Monitor }[] = [
  { value: "system", label: "自動", Icon: Monitor },
  { value: "light", label: "ライト", Icon: Sun },
  { value: "dark", label: "ダーク", Icon: Moon },
];

export function FooterThemeToggle() {
  const { theme, setTheme } = useTheme();
  // SSR と初回クライアント描画の不一致（ハイドレーション）を避けるため hydration ガード
  const mounted = useIsHydrated();

  const handleChange = (next: Mode) => {
    // テーマは localStorage 一本化（next-themes）。DB同期は廃止。
    setTheme(next);
  };

  return (
    <span className="inline-flex items-center gap-1.5 align-middle text-sm text-muted-foreground">
      <span>表示モード</span>
      <span
        role="radiogroup"
        aria-label="表示モード"
        className="inline-flex items-center gap-1"
      >
        {OPTIONS.map(({ value, label, Icon }) => {
          const selected = mounted && theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              title={label}
              onClick={() => handleChange(value)}
              className={`p-1.5 rounded transition-colors ${
                selected
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </span>
    </span>
  );
}
