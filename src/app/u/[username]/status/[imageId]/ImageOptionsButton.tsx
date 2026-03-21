"use client";

import { Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  POSITION_LABELS,
  COLOR_LABELS,
  SIZE_LABELS,
  FONT_LABELS,
  ARRANGEMENT_LABELS,
  type Position,
  type Color,
  type Size,
  type FontFamily,
  type Arrangement,
} from "@/types";

interface ImageOptionsButtonProps {
  position: string;
  color: string;
  size: string;
  font: string;
  arrangement: string;
}

export function ImageOptionsButton({
  position,
  color,
  size,
  font,
  arrangement,
}: ImageOptionsButtonProps) {
  const positionLabel = POSITION_LABELS[position as Position] || position;
  const colorLabel = COLOR_LABELS[color as Color] || color;
  const sizeLabel = SIZE_LABELS[size as Size] || size;
  const fontLabel = FONT_LABELS[font as FontFamily] || font;
  const arrangementLabel = ARRANGEMENT_LABELS[arrangement as Arrangement] || arrangement;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-1 rounded hover:bg-muted transition-colors"
          title="投稿オプション"
        >
          <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        <DropdownMenuItem className="cursor-default focus:bg-transparent">
          <span className="text-muted-foreground">位置:</span>
          <span className="ml-auto">{positionLabel}</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-default focus:bg-transparent">
          <span className="text-muted-foreground">色:</span>
          <span className="ml-auto">{colorLabel}</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-default focus:bg-transparent">
          <span className="text-muted-foreground">サイズ:</span>
          <span className="ml-auto">{sizeLabel}</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-default focus:bg-transparent">
          <span className="text-muted-foreground">フォント:</span>
          <span className="ml-auto">{fontLabel}</span>
        </DropdownMenuItem>
        {arrangement !== "none" && (
          <DropdownMenuItem className="cursor-default focus:bg-transparent">
            <span className="text-muted-foreground">アレンジ:</span>
            <span className="ml-auto">{arrangementLabel}</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
