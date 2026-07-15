"use client";

import type React from "react";
import { useSegmentThumb } from "@/components/SegmentControl";

/**
 * create の「期間限定アレンジ」トグル（「なし」1 : 「季節」2 の不等幅＋amber強調）。
 *
 * 共通 SegmentControl と違い、サムの色が選択位置で変わる（なし＝ニュートラル / 季節＝amber）
 * ため専用実装にしている。位置計測（サムのスライド）だけ useSegmentThumb を共有し、選択中
 * ボタンは他のセグメント同様 data-seg-active で示す。サム未計測（初回）は選択ボタン自身に
 * 背景を出すフォールバックで、選択が一瞬でも消えないようにする。
 */
export function SeasonToggle({
  seasonLabel,
  seasonPeriod,
  seasonOn,
  disabled,
  onChange,
}: {
  seasonLabel: React.ReactNode;
  seasonPeriod: string;
  seasonOn: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  const { containerRef, rect } = useSegmentThumb(seasonOn ? "on" : "off", seasonPeriod);
  const thumbActive = rect !== null;

  const options = [
    { on: false, label: <>なし</> },
    {
      on: true,
      label: (
        <>
          {seasonLabel}
          <span className="text-xs">（{seasonPeriod}限定）</span>
        </>
      ),
    },
  ];

  return (
    <div
      ref={containerRef}
      className={`relative flex rounded-lg border p-1 gap-1 ${
        seasonOn
          ? "border-amber-300 bg-amber-100/70 dark:border-amber-800/70 dark:bg-amber-950/40"
          : "bg-muted"
      }`}
    >
      {/* サム。選択位置に応じて色（amber / ニュートラル）が変わり、位置とともにクロスフェード */}
      {rect && (
        <span
          aria-hidden
          className={`absolute left-0 top-0 z-0 rounded-md shadow-sm !transition-[transform,width,height,background-color] !duration-300 !ease-out ${
            seasonOn ? "bg-amber-500" : "bg-background"
          }`}
          style={{
            width: rect.width,
            height: rect.height,
            transform: `translate(${rect.left}px, ${rect.top}px)`,
          }}
        />
      )}
      {options.map((opt) => {
        const selected = seasonOn === opt.on;
        return (
          <button
            key={String(opt.on)}
            data-seg-active={selected ? "true" : undefined}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.on)}
            className={`relative z-10 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
              opt.on ? "flex-[2_1_0%]" : "flex-[1_1_0%]"
            } ${
              selected
                ? seasonOn
                  ? "text-white"
                  : "text-foreground"
                : seasonOn
                  ? "text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
                  : "text-muted-foreground hover:text-foreground"
            } ${
              selected && !thumbActive
                ? seasonOn
                  ? "bg-amber-500 shadow-sm"
                  : "bg-background shadow-sm"
                : ""
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
