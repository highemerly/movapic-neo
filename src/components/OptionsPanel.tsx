"use client";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Position,
  FontFamily,
  Color,
  Size,
  OutputFormat,
  Arrangement,
  Visibility,
  POSITION_LABELS,
  FONT_LABELS,
  COLORS,
  STROKE_COLORS,
  COLOR_LABELS,
  ARRANGEMENT_LABELS,
  VISIBILITY_LABELS,
} from "@/types";

interface OptionsPanelProps {
  position: Position;
  font: FontFamily;
  color: Color;
  size: Size;
  output: OutputFormat;
  arrangement: Arrangement;
  visibility: Visibility;
  instanceDomain?: string;
  onPositionChange: (value: Position) => void;
  onFontChange: (value: FontFamily) => void;
  onColorChange: (value: Color) => void;
  onSizeChange: (value: Size) => void;
  onOutputChange: (value: OutputFormat) => void;
  onArrangementChange: (value: Arrangement) => void;
  onVisibilityChange: (value: Visibility) => void;
  disabled?: boolean;
  onSaveDefaults?: () => void;
  isSavingDefaults?: boolean;
  saveSuccess?: boolean;
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
  output,
  arrangement,
  visibility,
  instanceDomain,
  onPositionChange,
  onFontChange,
  onColorChange,
  onSizeChange,
  onOutputChange,
  onArrangementChange,
  onVisibilityChange,
  disabled,
  onSaveDefaults,
  isSavingDefaults,
  saveSuccess,
}: OptionsPanelProps) {
  const positions: Position[] = ["top", "bottom", "left", "right"];
  const colors: Color[] = ["white", "red", "blue", "green", "yellow", "brown", "pink", "orange"];
  const sizes: Size[] = ["small", "medium", "large", "extra-large"];
  const fonts: FontFamily[] = ["hui-font", "noto-sans-jp", "light-novel-pop"];
  const outputs: OutputFormat[] = ["mastodon", "misskey", "none"];
  const arrangements: Arrangement[] = ["none", "neon", "stamp"];
  const visibilities: Visibility[] = ["public", "unlisted", "local"];

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
              className="h-8 mx-auto object-contain"
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

      {/* 連携先への同時投稿 */}
      <div className="space-y-2">
        <Label>{instanceDomain || "連携サーバー"} への同時投稿</Label>
        <SegmentControl
          value={visibility}
          options={visibilities}
          onChange={onVisibilityChange}
          disabled={disabled}
          renderOption={(v) => (
            <span className="text-sm">{VISIBILITY_LABELS[v]}</span>
          )}
        />
      </div>

      {/* 初期値保存 */}
      {onSaveDefaults && (
        <Button
          type="button"
          onClick={onSaveDefaults}
          disabled={disabled || isSavingDefaults}
          variant="outline"
          size="lg"
          className={`w-full ${
            saveSuccess
              ? "border-green-500/50 text-green-600 dark:text-green-400"
              : ""
          }`}
        >
          {isSavingDefaults
            ? "保存中..."
            : saveSuccess
              ? "保存しました"
              : "このオプションを初期値として保存"}
        </Button>
      )}
    </div>
  );
}
