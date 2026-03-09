"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Position,
  FontFamily,
  Color,
  Size,
  OutputFormat,
  POSITION_LABELS,
  FONT_LABELS,
  COLOR_LABELS,
  SIZE_LABELS,
  OUTPUT_LABELS,
  COLORS,
  DEFAULT_POSITION,
  DEFAULT_FONT,
  DEFAULT_COLOR,
  DEFAULT_SIZE,
  DEFAULT_OUTPUT,
} from "@/types";

interface CommandSelectProps {
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

export function CommandSelect({
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
}: CommandSelectProps) {
  const handleReset = () => {
    onPositionChange(DEFAULT_POSITION);
    onFontChange(DEFAULT_FONT);
    onColorChange(DEFAULT_COLOR);
    onSizeChange(DEFAULT_SIZE);
    onOutputChange(DEFAULT_OUTPUT);
  };

  return (
    <div className="space-y-4">
      {/* 1行目: 位置・カラー・サイズ */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="position">位置</Label>
          <Select
            value={position}
            onValueChange={(v) => onPositionChange(v as Position)}
            disabled={disabled}
          >
            <SelectTrigger id="position">
              <SelectValue>
                <span className="flex items-center gap-1">
                  <img
                    src={`/positions/${position}.png`}
                    alt={POSITION_LABELS[position]}
                    className="h-5 object-contain"
                  />
                  {POSITION_LABELS[position]}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(POSITION_LABELS) as Position[]).map((key) => (
                <SelectItem key={key} value={key}>
                  <span className="flex items-center gap-2">
                    <img
                      src={`/positions/${key}.png`}
                      alt={POSITION_LABELS[key]}
                      className="h-6 object-contain"
                    />
                    {POSITION_LABELS[key]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="color">カラー</Label>
          <Select
            value={color}
            onValueChange={(v) => onColorChange(v as Color)}
            disabled={disabled}
          >
            <SelectTrigger id="color">
              <SelectValue>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block h-4 w-4 rounded border border-gray-300 shrink-0"
                    style={{ backgroundColor: COLORS[color] }}
                  />
                  {COLOR_LABELS[color]}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(COLOR_LABELS) as Color[]).map((key) => (
                <SelectItem key={key} value={key}>
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-4 w-4 rounded border border-gray-300"
                      style={{ backgroundColor: COLORS[key] }}
                    />
                    {COLOR_LABELS[key]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="size">サイズ</Label>
          <Select
            value={size}
            onValueChange={(v) => onSizeChange(v as Size)}
            disabled={disabled}
          >
            <SelectTrigger id="size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SIZE_LABELS) as Size[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SIZE_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 2行目: フォント・出力形式 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="font">フォント</Label>
          <Select
            value={font}
            onValueChange={(v) => onFontChange(v as FontFamily)}
            disabled={disabled}
          >
            <SelectTrigger id="font">
              <SelectValue>
                <img
                  src={`/fonts/${font}.png`}
                  alt={FONT_LABELS[font]}
                  className="h-6 object-contain"
                />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FONT_LABELS) as FontFamily[]).map((key) => (
                <SelectItem key={key} value={key}>
                  <img
                    src={`/fonts/${key}.png`}
                    alt={FONT_LABELS[key]}
                    className="h-6 object-contain"
                  />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="output">形式</Label>
          <Select
            value={output}
            onValueChange={(v) => onOutputChange(v as OutputFormat)}
            disabled={disabled}
          >
            <SelectTrigger id="output">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(OUTPUT_LABELS) as OutputFormat[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {OUTPUT_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleReset}
        disabled={disabled}
        className="w-full"
      >
        設定を初期値に戻す
      </Button>
    </div>
  );
}
