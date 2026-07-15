"use client";

import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * ピル型のセグメント選択トグル（角丸ボックス＋等分ボタン）。
 *
 * 位置／色／サイズ／フォント／アレンジ（OptionsPanel）、公開範囲（VisibilityPicker）、
 * 撮影情報（create ④）で共通利用する。以前は各所で同じマークアップを手書き複製していた。
 *
 * 選択中の背景（サム）は各ボタンに直接 bg を付けるのではなく、選択ボタンの位置・サイズを
 * 実測した absolute レイヤーで描き、値が変わると transition で滑らかに移動させる（現代的な
 * スライド表現）。SSR／初回計測前は選択ボタン自身に bg を出すフォールバックにして、選択状態
 * が一瞬でも消えないようにする（実測できた次の描画からアニメーションを有効化）。
 *
 * バリエーションは props で吸収する:
 * - size: 文字サイズ（"sm"=text-sm 既定／"xs"=text-[11px]。長いラベルを詰める用途）
 * - truncate: 各ボタンを1行省略（... ）にする（撮影場所など可変長ラベル用）
 * - optionDisabled: 選択肢ごとの個別無効化（例: 過去データが無い都道府県/市町村）
 *
 * なお create のシーズントグルは amber強調＋不等幅（2:1）の意図的に差別化された
 * 「おすすめ」枠のため、あえてこの共通化の対象外にしている。
 */

// SSR では useLayoutEffect が警告を出すため、クライアントでだけ layout effect を使う。
// layout effect にすることで、値変更→計測→サム移動が1フレームのちらつきなく繋がる。
const useIsomorphicLayoutEffect = typeof document !== "undefined" ? useLayoutEffect : useEffect;

type SegmentSize = "sm" | "xs";
type ThumbRect = { left: number; top: number; width: number; height: number };

function segmentButtonClass({
  selected,
  disabled,
  size,
  truncate,
  thumbActive,
}: {
  selected: boolean;
  disabled: boolean;
  size: SegmentSize;
  truncate: boolean;
  thumbActive: boolean;
}): string {
  return [
    "relative z-10 flex-1 rounded-md px-2 py-1.5 font-medium transition-colors",
    size === "xs" ? "text-[11px]" : "text-sm",
    truncate ? "min-w-0 truncate" : "",
    selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
    // サム未計測（SSR/初回）のときだけ、選択ボタン自身に背景を出すフォールバック
    selected && !thumbActive ? "bg-background shadow-sm" : "",
    disabled ? "opacity-50 cursor-not-allowed" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// 選択中ボタン（data-seg-active）の位置・サイズを測り、値変化で滑らかに動くサムを提供する。
// depsKey に options/size 等を含め、選択肢や幅が変わったら測り直す。
// create の期間限定アレンジ（色可変サムの専用トグル）でも計測部分だけ再利用する。
export function useSegmentThumb(value: string, depsKey: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<ThumbRect | null>(null);

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const el = container.querySelector<HTMLButtonElement>('[data-seg-active="true"]');
      if (el) setRect({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
    };
    measure();
    // コンテナ幅の変化（レスポンシブ・レイアウトシフト）に追従
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [value, depsKey]);

  return { containerRef, rect };
}

// サムは初回だけ rect が定まって「新規挿入」されるため無アニメ、以降の transform 変化で
// のみ滑らかに移動する（transition は常時付けておけば初回はアニメーションしない）。
//
// transition を `!important`（`!` 修飾）にしているのは、テーマ切替時に next-themes が
// 挿入する `* { transition: none !important }`（layout.tsx の disableTransitionOnChange・
// 色ちらつき防止）に負けないため。クラスセレクタ(.foo)は `*` より特異性が高いので、同じ
// !important でもこちらが勝ち、テーマのダーク/ライト切替でもサムがスライドする。色は
// transition 対象に含めていないので、ちらつき防止の意図は保たれる。
function SegmentThumb({ rect }: { rect: ThumbRect | null }) {
  if (!rect) return null;
  return (
    <span
      aria-hidden
      className="absolute left-0 top-0 z-0 rounded-md bg-background shadow-sm !transition-[transform,width,height] !duration-300 !ease-out"
      style={{
        width: rect.width,
        height: rect.height,
        transform: `translate(${rect.left}px, ${rect.top}px)`,
      }}
    />
  );
}

type SegmentControlProps<T extends string> = {
  value: T;
  options: T[];
  onChange: (value: T) => void;
  disabled?: boolean;
  renderOption: (option: T, isSelected: boolean) => React.ReactNode;
  size?: SegmentSize;
  truncate?: boolean;
  optionDisabled?: (option: T) => boolean;
};

export function SegmentControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
  renderOption,
  size = "sm",
  truncate = false,
  optionDisabled,
}: SegmentControlProps<T>) {
  const { containerRef, rect } = useSegmentThumb(
    value,
    `${options.join("|")}:${size}:${truncate}`
  );
  const thumbActive = rect !== null;

  return (
    <div ref={containerRef} className="relative flex rounded-lg border bg-muted p-1 gap-1">
      <SegmentThumb rect={rect} />
      {options.map((option) => {
        const isDisabled = Boolean(disabled) || Boolean(optionDisabled?.(option));
        const selected = value === option;
        return (
          <button
            key={option}
            data-seg-active={selected ? "true" : undefined}
            type="button"
            onClick={() => onChange(option)}
            disabled={isDisabled}
            className={segmentButtonClass({ selected, disabled: isDisabled, size, truncate, thumbActive })}
          >
            {renderOption(option, selected)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 選択肢が多い場合に2行（先頭4件／残り）で並べるバリアント。色（8件）で使用。
 * サムは2行にまたがって（left/top両方を）移動する。
 */
export function TwoRowSegmentControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
  renderOption,
  size = "sm",
  truncate = false,
  optionDisabled,
}: SegmentControlProps<T>) {
  const firstRow = options.slice(0, 4);
  const secondRow = options.slice(4);
  const { containerRef, rect } = useSegmentThumb(
    value,
    `${options.join("|")}:${size}:${truncate}`
  );
  const thumbActive = rect !== null;

  const renderRow = (row: T[]) => (
    <div className="flex gap-1">
      {row.map((option) => {
        const isDisabled = Boolean(disabled) || Boolean(optionDisabled?.(option));
        const selected = value === option;
        return (
          <button
            key={option}
            data-seg-active={selected ? "true" : undefined}
            type="button"
            onClick={() => onChange(option)}
            disabled={isDisabled}
            className={segmentButtonClass({ selected, disabled: isDisabled, size, truncate, thumbActive })}
          >
            {renderOption(option, selected)}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={containerRef} className="relative rounded-lg border bg-muted p-1 space-y-1">
      <SegmentThumb rect={rect} />
      {renderRow(firstRow)}
      {renderRow(secondRow)}
    </div>
  );
}
