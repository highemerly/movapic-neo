"use client";

import { Label } from "@/components/ui/label";
import {
  Position,
  FontFamily,
  Color,
  Size,
  Arrangement,
  POSITION_LABELS,
  FONT_LABELS,
  COLORS,
  STROKE_COLORS,
  COLOR_LABELS,
  ARRANGEMENT_LABELS,
} from "@/types";

interface OptionsPanelProps {
  position: Position;
  font: FontFamily;
  color: Color;
  size: Size;
  arrangement: Arrangement;
  onPositionChange: (value: Position) => void;
  onFontChange: (value: FontFamily) => void;
  onColorChange: (value: Color) => void;
  onSizeChange: (value: Size) => void;
  onArrangementChange: (value: Arrangement) => void;
  disabled?: boolean;
}

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
          className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
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
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
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
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
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

export function OptionsPanel({
  position,
  font,
  color,
  size,
  arrangement,
  onPositionChange,
  onFontChange,
  onColorChange,
  onSizeChange,
  onArrangementChange,
  disabled,
}: OptionsPanelProps) {
  const positions: Position[] = ["top", "bottom", "left", "right"];
  const colors: Color[] = ["white", "red", "blue", "green", "yellow", "brown", "pink", "orange"];
  const sizes: Size[] = ["small", "medium", "large", "extra-large"];
  const fonts: FontFamily[] = ["hui-font", "noto-sans-jp", "light-novel-pop"];
  const arrangements: Arrangement[] = ["none", "neon", "stamp"];

  return (
    <div className="space-y-5">
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
              className="text-base font-bold"
              style={{
                color: COLORS[c],
                textShadow: `
                  -1px -1px 0 ${STROKE_COLORS[c]},
                   1px -1px 0 ${STROKE_COLORS[c]},
                  -1px  1px 0 ${STROKE_COLORS[c]},
                   1px  1px 0 ${STROKE_COLORS[c]}
                `,
              }}
            >
              {COLOR_LABELS[c]}
            </span>
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
                    : s === "large"
                      ? "text-lg"
                      : "text-xl"
              }
            >
              {s === "small" ? "小" : s === "medium" ? "中" : s === "large" ? "大" : "特大"}
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
              className="h-8 mx-auto object-contain dark:invert"
            />
          )}
        />
      </div>

      {/* アレンジ */}
      <div className="space-y-2">
        <Label>アレンジ</Label>
        <SegmentControl
          value={arrangement}
          options={arrangements}
          onChange={onArrangementChange}
          disabled={disabled}
          renderOption={(a) =>
            a === "none" ? (
              <span className="text-sm">{ARRANGEMENT_LABELS[a]}</span>
            ) : (
              <img
                src={`/arrangements/${a}.png`}
                alt={ARRANGEMENT_LABELS[a]}
                className="h-8 mx-auto object-contain"
              />
            )
          }
        />
      </div>
    </div>
  );
}
