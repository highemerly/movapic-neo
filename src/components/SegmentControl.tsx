"use client";

import type React from "react";

/**
 * ピル型のセグメント選択トグル（角丸ボックス＋等分ボタン）。
 *
 * 位置／色／サイズ／フォント／アレンジ（OptionsPanel）、公開範囲（VisibilityPicker）、
 * 撮影情報（create ④）で共通利用する。以前は各所で同じマークアップを手書き複製していた。
 *
 * バリエーションは props で吸収する:
 * - size: 文字サイズ（"sm"=text-sm 既定／"xs"=text-[11px]。長いラベルを詰める用途）
 * - truncate: 各ボタンを1行省略（... ）にする（撮影場所など可変長ラベル用）
 * - optionDisabled: 選択肢ごとの個別無効化（例: 過去データが無い都道府県/市町村）
 *
 * なお create のシーズントグルは amber強調＋不等幅（2:1）の意図的に差別化された
 * 「おすすめ」枠のため、あえてこの共通化の対象外にしている。
 */

type SegmentSize = "sm" | "xs";

function segmentButtonClass({
  selected,
  disabled,
  size,
  truncate,
}: {
  selected: boolean;
  disabled: boolean;
  size: SegmentSize;
  truncate: boolean;
}): string {
  return [
    "flex-1 rounded-md px-2 py-1.5 font-medium transition-colors",
    size === "xs" ? "text-[11px]" : "text-sm",
    truncate ? "min-w-0 truncate" : "",
    selected
      ? "bg-background text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
    disabled ? "opacity-50 cursor-not-allowed" : "",
  ]
    .filter(Boolean)
    .join(" ");
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
  return (
    <div className="flex rounded-lg border bg-muted p-1 gap-1">
      {options.map((option) => {
        const isDisabled =
          Boolean(disabled) || Boolean(optionDisabled?.(option));
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            disabled={isDisabled}
            className={segmentButtonClass({
              selected: value === option,
              disabled: isDisabled,
              size,
              truncate,
            })}
          >
            {renderOption(option, value === option)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 選択肢が多い場合に2行（先頭4件／残り）で並べるバリアント。色（8件）で使用。
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

  const renderRow = (row: T[]) => (
    <div className="flex gap-1">
      {row.map((option) => {
        const isDisabled =
          Boolean(disabled) || Boolean(optionDisabled?.(option));
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            disabled={isDisabled}
            className={segmentButtonClass({
              selected: value === option,
              disabled: isDisabled,
              size,
              truncate,
            })}
          >
            {renderOption(option, value === option)}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="rounded-lg border bg-muted p-1 space-y-1">
      {renderRow(firstRow)}
      {renderRow(secondRow)}
    </div>
  );
}
