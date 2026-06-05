"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Loader2, Monitor, Moon, Sun } from "lucide-react";
import { Label } from "@/components/ui/label";

type DisplayMode = "system" | "light" | "dark";
type SaveState = "idle" | "saving" | "saved" | "error";

interface DisplayModeSelectorProps {
  initialMode: DisplayMode;
}

const OPTIONS: { value: DisplayMode; label: string; icon: typeof Monitor }[] = [
  { value: "system", label: "自動", icon: Monitor },
  { value: "light", label: "ライト", icon: Sun },
  { value: "dark", label: "ダーク", icon: Moon },
];

export function DisplayModeSelector({ initialMode }: DisplayModeSelectorProps) {
  const { setTheme } = useTheme();
  // クライアントの実体値はnext-themesに任せつつ、UIの選択状態はDB値で初期化
  const [mode, setMode] = useState<DisplayMode>(initialMode);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const savedClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);

  // 初回マウント時、DBの値でnext-themesも同期させる（複数端末で揃える）
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    setTheme(initialMode);
  }, [initialMode, setTheme]);

  const handleChange = async (next: DisplayMode) => {
    if (next === mode) return;
    const previous = mode;
    setMode(next);
    setTheme(next); // 即時反映
    setSaveState("saving");
    setError(null);
    try {
      const res = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayMode: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "保存に失敗しました");
      }
      setSaveState("saved");
      if (savedClearRef.current) clearTimeout(savedClearRef.current);
      savedClearRef.current = setTimeout(() => setSaveState("idle"), 1500);
    } catch (err) {
      setMode(previous);
      setTheme(previous);
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setSaveState("error");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Label>表示モード</Label>
        {saveState === "saving" && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            保存中...
          </span>
        )}
        {saveState === "saved" && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check className="h-3 w-3" />
            保存しました
          </span>
        )}
        {saveState === "error" && error && (
          <span className="text-xs text-destructive">{error}</span>
        )}
      </div>
      <div role="radiogroup" className="flex rounded-lg border bg-muted p-1 gap-1">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const selected = mode === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => handleChange(value)}
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
