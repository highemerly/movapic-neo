"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun, LayoutGrid, Columns3 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useIsHydrated } from "@/hooks/useIsHydrated";
import { useGalleryLayout, type GalleryLayout } from "@/hooks/useGalleryLayout";

type DisplayMode = "system" | "light" | "dark";

const THEME_OPTIONS: { value: DisplayMode; label: string; icon: typeof Monitor }[] = [
  { value: "system", label: "自動", icon: Monitor },
  { value: "light", label: "ライト", icon: Sun },
  { value: "dark", label: "ダーク", icon: Moon },
];

const LAYOUT_OPTIONS: { value: GalleryLayout; label: string; icon: typeof Monitor }[] = [
  { value: "grid", label: "タイル", icon: LayoutGrid },
  { value: "packed", label: "積み上げ", icon: Columns3 },
];

// 「外観」セクションの中身。デザイン（テーマ）とタイムライン表示を並べる。
// 見出しは親セクション（page.tsx の「外観」）が担うため、ここではブラウザローカルの注意書き＋
// 各設定を直接並べる（テーマ=next-themes/localStorage、レイアウト=useGalleryLayout）。
export function DisplayModeSelector() {
  // テーマは localStorage 一本化（next-themes）。DB同期は廃止。
  const { theme, setTheme } = useTheme();
  // SSR と初回クライアント描画の不一致（ハイドレーション）を避けるため hydration ガード
  const mounted = useIsHydrated();
  const [layout, setLayout] = useGalleryLayout();

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        この設定はお使いのブラウザにのみ反映されます（別のブラウザや端末には影響しません）。
      </p>

      {/* デザイン */}
      <div className="space-y-2">
        <Label>デザイン</Label>
        <div role="radiogroup" className="flex rounded-lg border bg-muted p-1 gap-1">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const selected = mounted && theme === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(value)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-sm font-medium transition-colors ${
                  selected
                    ? "border-border bg-background text-foreground shadow-sm"
                    : "border-transparent text-muted-foreground hover:text-foreground"
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

      {/* タイムライン表示 */}
      <div className="space-y-2">
        <Label>タイムライン表示</Label>
        <div role="radiogroup" className="flex rounded-lg border bg-muted p-1 gap-1">
          {LAYOUT_OPTIONS.map(({ value, label, icon: Icon }) => {
            const selected = mounted && layout === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setLayout(value)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-sm font-medium transition-colors ${
                  selected
                    ? "border-border bg-background text-foreground shadow-sm"
                    : "border-transparent text-muted-foreground hover:text-foreground"
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
    </div>
  );
}
