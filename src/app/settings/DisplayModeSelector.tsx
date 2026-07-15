"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun, LayoutGrid, Columns3 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { SegmentControl } from "@/components/SegmentControl";
import { SettingField } from "@/components/SettingRow";
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
        この設定はお使いのブラウザにのみ反映され、別のブラウザや端末には影響しません。
      </p>

      {/* テーマ。hydration 前は value を空にして未選択で描画し、mount 後に localStorage の値へ */}
      <SettingField className="space-y-2">
        <Label>テーマ</Label>
        <SegmentControl
          value={mounted ? theme ?? "" : ""}
          options={THEME_OPTIONS.map((o) => o.value) as string[]}
          onChange={setTheme}
          renderOption={(value) => {
            const opt = THEME_OPTIONS.find((o) => o.value === value);
            if (!opt) return null;
            const Icon = opt.icon;
            return (
              <span className="flex items-center justify-center gap-1">
                <Icon className="h-4 w-4" />
                <span>{opt.label}</span>
              </span>
            );
          }}
        />
      </SettingField>

      {/* タイムライン表示 */}
      <SettingField className="space-y-2">
        <Label>タイムライン表示</Label>
        <SegmentControl
          value={mounted ? layout : ""}
          options={LAYOUT_OPTIONS.map((o) => o.value) as string[]}
          onChange={(value) => setLayout(value as GalleryLayout)}
          renderOption={(value) => {
            const opt = LAYOUT_OPTIONS.find((o) => o.value === value);
            if (!opt) return null;
            const Icon = opt.icon;
            return (
              <span className="flex items-center justify-center gap-1">
                <Icon className="h-4 w-4" />
                <span>{opt.label}</span>
              </span>
            );
          }}
        />
      </SettingField>
    </div>
  );
}
