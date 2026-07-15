"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface MasonryGridProps<T> {
  items: T[];
  /** 画像のアスペクト比（width / height）を返す */
  aspect: (item: T) => number;
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** 各アイテムのラッパ div に付与する追加クラス（差分更新の入場アニメ等）。 */
  itemClassName?: (item: T) => string | undefined;
  gap?: number;
}

// 極端なアスペクト比（縦長/横長すぎ）で1列が破綻しないよう制限
function clampAspect(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(Math.max(value, 0.3), 4);
}

// Masonry は縦長画像が縦に伸びるため、列数を少なめにして1枚を大きく＝文字を
// 読みやすく保つ（正方形グリッドより少ない列数）。
function columnsForWidth(width: number): number {
  if (width < 640) return 2; // スマホ
  if (width < 1024) return 3; // タブレット
  return 4; // PC
}

/**
 * アスペクト比を保ったまま縦に流す Masonry（Pinterest 風）レイアウト。
 * 各画像を「最短列」に順に積むことで隙間を最小化しつつ、投稿順（新しい順）も
 * おおむね保つ。width/height が既知なので aspect-ratio で枠が先に確定し、
 * 画像読込前でもレイアウトシフトしない。
 */
export function MasonryGrid<T>({
  items,
  aspect,
  getKey,
  renderItem,
  itemClassName,
  gap = 4,
}: MasonryGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const numCols = width > 0 ? columnsForWidth(width) : 0;
  const columns: T[][] = Array.from({ length: numCols }, () => []);

  if (numCols > 0) {
    const colWidth = (width - gap * (numCols - 1)) / numCols;
    const heights = new Array(numCols).fill(0);
    for (const item of items) {
      // 最も低い列を選んで積む（同高なら左を優先＝順序が保たれやすい）
      let min = 0;
      for (let i = 1; i < numCols; i++) {
        if (heights[i] < heights[min]) min = i;
      }
      columns[min].push(item);
      // 列幅固定なので高さ = 幅 / アスペクト比
      heights[min] += colWidth / clampAspect(aspect(item)) + gap;
    }
  }

  return (
    <div ref={containerRef} className="flex" style={{ gap }}>
      {columns.map((col, colIndex) => (
        <div
          key={colIndex}
          className="flex min-w-0 flex-1 flex-col"
          style={{ gap }}
        >
          {col.map((item) => (
            <div
              key={getKey(item)}
              className={itemClassName?.(item)}
              style={{ aspectRatio: clampAspect(aspect(item)) }}
            >
              {renderItem(item)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
