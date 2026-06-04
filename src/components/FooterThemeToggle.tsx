"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

type Mode = "system" | "light" | "dark";

const OPTIONS: { value: Mode; label: string; Icon: typeof Monitor }[] = [
  { value: "system", label: "自動", Icon: Monitor },
  { value: "light", label: "ライト", Icon: Sun },
  { value: "dark", label: "ダーク", Icon: Moon },
];

export function FooterThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleChange = (next: Mode) => {
    setTheme(next);
    // ログイン中なら DB へも反映（未ログイン時の 401 はサイレント）
    fetch("/api/v1/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayMode: next }),
    }).catch(() => {});
  };

  return (
    <span className="inline-flex items-center gap-1.5 align-middle text-sm text-muted-foreground">
      <span>表示モード</span>
      <span
        role="radiogroup"
        aria-label="表示モード"
        className="inline-flex items-center gap-0.5"
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
