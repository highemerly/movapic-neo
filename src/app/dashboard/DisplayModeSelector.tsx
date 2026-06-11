"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useIsHydrated } from "@/hooks/useIsHydrated";

type DisplayMode = "system" | "light" | "dark";

const OPTIONS: { value: DisplayMode; label: string; icon: typeof Monitor }[] = [
  { value: "system", label: "自動", icon: Monitor },
  { value: "light", label: "ライト", icon: Sun },
  { value: "dark", label: "ダーク", icon: Moon },
];

export function DisplayModeSelector() {
  // テーマは localStorage 一本化（next-themes）。DB同期は廃止。
  const { theme, setTheme } = useTheme();
  // SSR と初回クライアント描画の不一致（ハイドレーション）を避けるため hydration ガード
  const mounted = useIsHydrated();

  return (
    <div className="space-y-2">
      <Label>表示モード</Label>
      <div role="radiogroup" className="flex rounded-lg border bg-muted p-1 gap-1">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const selected = mounted && theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(value)}
              className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center justify-center gap-1">
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
