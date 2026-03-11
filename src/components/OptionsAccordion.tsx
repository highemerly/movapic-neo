"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Position,
  FontFamily,
  Color,
  Size,
  OutputFormat,
  POSITION_LABELS,
  FONT_LABELS,
  COLORS,
  DEFAULT_POSITION,
  DEFAULT_FONT,
  DEFAULT_COLOR,
  DEFAULT_SIZE,
  DEFAULT_OUTPUT,
} from "@/types";

interface OptionsAccordionProps {
  position: Position;
  font: FontFamily;
  color: Color;
  size: Size;
  output: OutputFormat;
  onPositionChange: (value: Position) => void;
  onFontChange: (value: FontFamily) => void;
  onColorChange: (value: Color) => void;
  onSizeChange: (value: Size) => void;
  onOutputChange: (value: OutputFormat) => void;
  disabled?: boolean;
}

// セグメントコントロール用コンポーネント
function SegmentControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
  renderOption,
}: {
  value: T;
  options: T[];
  onChange: (value: T) => void;
  disabled?: boolean;
  renderOption: (option: T, isSelected: boolean) => React.ReactNode;
}) {
  return (
    <div className="flex rounded-lg border bg-muted p-1 gap-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          disabled={disabled}
          className={`flex-1 rounded-md px-3 py-2 font-medium transition-colors ${
            value === option
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {renderOption(option, value === option)}
        </button>
      ))}
    </div>
  );
}

// 2行セグメントコントロール（色用）
function TwoRowSegmentControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
  renderOption,
}: {
  value: T;
  options: T[];
  onChange: (value: T) => void;
  disabled?: boolean;
  renderOption: (option: T, isSelected: boolean) => React.ReactNode;
}) {
  const firstRow = options.slice(0, 4);
  const secondRow = options.slice(4);

  return (
    <div className="rounded-lg border bg-muted p-1 space-y-1">
      <div className="flex gap-1">
        {firstRow.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            disabled={disabled}
            className={`flex-1 rounded-md px-3 py-2 font-medium transition-colors ${
              value === option
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {renderOption(option, value === option)}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        {secondRow.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            disabled={disabled}
            className={`flex-1 rounded-md px-3 py-2 font-medium transition-colors ${
              value === option
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {renderOption(option, value === option)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function OptionsAccordion({
  position,
  font,
  color,
  size,
  output,
  onPositionChange,
  onFontChange,
  onColorChange,
  onSizeChange,
  onOutputChange,
  disabled,
}: OptionsAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleReset = () => {
    onPositionChange(DEFAULT_POSITION);
    onFontChange(DEFAULT_FONT);
    onColorChange(DEFAULT_COLOR);
    onSizeChange(DEFAULT_SIZE);
    onOutputChange(DEFAULT_OUTPUT);
  };

  const positions: Position[] = ["top", "bottom", "left", "right"];
  const colors: Color[] = ["white", "red", "blue", "green", "yellow", "brown", "pink", "orange"];
  const sizes: Size[] = ["small", "medium", "large"];
  const fonts: FontFamily[] = ["hui-font", "noto-sans-jp", "light-novel-pop"];
  const outputs: OutputFormat[] = ["mastodon", "misskey", "none"];

  return (
    <div className="rounded-lg border">
      {/* アコーディオンヘッダー */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-4 text-left"
        disabled={disabled}
      >
        <span className="font-medium">オプション設定</span>
        <ChevronDown
          className={`h-5 w-5 text-muted-foreground transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* アコーディオンコンテンツ */}
      {isOpen && (
        <div className="border-t px-4 pb-4 pt-2 space-y-6">
          {/* 位置 */}
          <div className="space-y-2">
            <Label>位置</Label>
            <SegmentControl
              value={position}
              options={positions}
              onChange={onPositionChange}
              disabled={disabled}
              renderOption={(pos) => (
                <span className="flex items-center justify-center gap-1 text-sm">
                  <img
                    src={`/positions/${pos}.png`}
                    alt={POSITION_LABELS[pos]}
                    className="h-4 object-contain"
                  />
                  <span>{POSITION_LABELS[pos]}</span>
                </span>
              )}
            />
          </div>

          {/* 色 */}
          <div className="space-y-2">
            <Label>色</Label>
            <TwoRowSegmentControl
              value={color}
              options={colors}
              onChange={onColorChange}
              disabled={disabled}
              renderOption={(c) => (
                <span
                  className="block h-5 w-5 mx-auto rounded-full border border-gray-300 shadow-sm"
                  style={{ backgroundColor: COLORS[c] }}
                />
              )}
            />
          </div>

          {/* サイズ */}
          <div className="space-y-2">
            <Label>サイズ</Label>
            <SegmentControl
              value={size}
              options={sizes}
              onChange={onSizeChange}
              disabled={disabled}
              renderOption={(s) => (
                <span
                  className={
                    s === "small"
                      ? "text-xs"
                      : s === "medium"
                        ? "text-sm"
                        : "text-lg"
                  }
                >
                  {s === "small" ? "小" : s === "medium" ? "中" : "大"}
                </span>
              )}
            />
          </div>

          {/* フォント */}
          <div className="space-y-2">
            <Label>フォント</Label>
            <SegmentControl
              value={font}
              options={fonts}
              onChange={onFontChange}
              disabled={disabled}
              renderOption={(f) => (
                <img
                  src={`/fonts/${f}.png`}
                  alt={FONT_LABELS[f]}
                  className="h-8 mx-auto object-contain"
                />
              )}
            />
          </div>

          {/* 出力形式 */}
          <div className="space-y-2">
            <Label>形式</Label>
            <SegmentControl
              value={output}
              options={outputs}
              onChange={onOutputChange}
              disabled={disabled}
              renderOption={(o) => (
                <span className="flex flex-col items-center text-sm">
                  <span>{o === "none" ? "なし" : o === "mastodon" ? "Mastodon" : "Misskey"}</span>
                  <span className="text-xs text-muted-foreground">
                    {o === "none" ? "(JPEG)" : "(AVIF)"}
                  </span>
                </span>
              )}
            />
          </div>

          {/* 設定リセット */}
          <button
            type="button"
            onClick={handleReset}
            disabled={disabled}
            className="w-full text-sm text-muted-foreground hover:text-foreground underline"
          >
            設定をリセット
          </button>
        </div>
      )}
    </div>
  );
}
