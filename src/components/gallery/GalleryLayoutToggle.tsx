"use client";

import { LayoutGrid, Columns3 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { useGalleryLayout, type GalleryLayout } from "@/hooks/useGalleryLayout";

const OPTIONS: { value: GalleryLayout; label: string; Icon: typeof LayoutGrid }[] = [
  { value: "grid", label: "タイル", Icon: LayoutGrid },
  { value: "packed", label: "積み上げ", Icon: Columns3 },
];

/**
 * 写真一覧の表示レイアウト切り替え。上級者向けのため控えめな見た目。
 * 画像に重なるフローティング（sticky）オーバーレイとして、現在の状態アイコンだけを
 * 1つ表示し、タップすると2択のメニューが開く。共有状態（localStorage）なので、
 * どの一覧で切り替えても全体に反映される。
 *
 * 親要素は `relative` にして、グリッド/Masonry の直前に置くこと。
 * 高さ 0 の sticky 行なので、一覧のレイアウト領域は消費しない。
 */
export function GalleryLayoutToggle() {
  const [layout, setLayout] = useGalleryLayout();
  const current = OPTIONS.find((o) => o.value === layout) ?? OPTIONS[0];
  const CurrentIcon = current.Icon;

  return (
    <div className="pointer-events-none sticky top-2 z-20 flex h-0 justify-end pr-1 standalone:top-[3.25rem]">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="表示レイアウトを変更"
          title="表示レイアウト"
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border bg-background/80 text-muted-foreground opacity-50 shadow-sm backdrop-blur-sm transition hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:opacity-100"
        >
          <CurrentIcon className="h-5 w-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[9rem]">
          <DropdownMenuRadioGroup
            value={layout}
            onValueChange={(v) => setLayout(v as GalleryLayout)}
          >
            {OPTIONS.map(({ value, label, Icon }) => (
              <DropdownMenuRadioItem key={value} value={value} className="gap-2">
                <Icon className="h-4 w-4" />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
