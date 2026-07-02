"use client";

import { Settings2, ScrollText } from "lucide-react";
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
import { seasonLabel } from "@/lib/seasons/catalog";
import Link from "@/components/Link";

interface ImageOptionsButtonProps {
  position: string;
  color: string;
  size: string;
  font: string;
  arrangement: string;
  /** シーズン（期間限定）キー。セット時は個別オプションの代わりにシーズン名のみ表示 */
  season?: string | null;
}

export function ImageOptionsButton({
  position,
  color,
  size,
  font,
  arrangement,
  season,
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
          className="inline-flex items-center justify-center -m-1.5 p-2 rounded-md hover:bg-muted transition-colors"
          title="投稿オプション"
        >
          <Settings2 className="w-4 h-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {season ? (
          // シーズン（期間限定）投稿: スタイル列は中立デフォルトなので、シーズン名だけ示す。
          <DropdownMenuItem className="cursor-default focus:bg-transparent">
            <span className="text-muted-foreground">シーズン:</span>
            <Link
              href="/license"
              title="フォントライセンス"
              className="ml-auto mr-1 text-muted-foreground hover:text-foreground"
            >
              <ScrollText className="w-3.5 h-3.5" />
            </Link>
            <span>{seasonLabel(season)}</span>
          </DropdownMenuItem>
        ) : (
          <>
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
          <Link
            href={`/license#${font}`}
            title="フォントライセンス"
            className="ml-auto mr-1 text-muted-foreground hover:text-foreground"
          >
            <ScrollText className="w-3.5 h-3.5" />
          </Link>
          <span>{fontLabel}</span>
        </DropdownMenuItem>
        {arrangement !== "none" && (
          <DropdownMenuItem className="cursor-default focus:bg-transparent">
            <span className="text-muted-foreground">アレンジ:</span>
            <span className="ml-auto">{arrangementLabel}</span>
          </DropdownMenuItem>
        )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
