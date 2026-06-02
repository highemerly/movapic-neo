/**
 * 都道府県別投稿の地図表示。表示モードはユーザーが切替可能:
 *   - thumbnail: タイルカルトグラム。各都道府県の最新画像のサムネイルに件数オーバーレイ（初期値）
 *   - heatmap:   実際の日本地図SVGに投稿数で色を塗ったヒートマップ
 *
 * いずれのモードでもタイル/パスをクリックすると、地図ページの
 * ?prefecture=○○ 形式に遷移して該当都道府県の画像一覧を下部に表示する。
 *
 * クライアントコンポーネント。
 */

"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Minus, RotateCcw } from "lucide-react";
import { JAPAN_TILE_GRID, PREFECTURE_BY_CODE } from "@/lib/geocode/prefectures";
import japanSvg from "@/lib/geocode/japan-svg-paths.json";

export interface PrefectureLatestImage {
  id: string;
  thumbnailKey: string | null;
  storageKey: string;
  position: string;
}

export interface PrefectureEntry {
  count: number;
  latest: PrefectureLatestImage;
}

export type PrefectureMapData = Record<string, PrefectureEntry>;

interface PrefectureHeatmapProps {
  data: PrefectureMapData;
  /** R2/S3 public bucket のベースURL。サムネイル参照に使う */
  publicUrl: string;
  /** 投稿者のusername（クリック時の遷移先URLに使う） */
  username: string;
  /** 現在ハイライト中の都道府県名（?prefecture=で選択中のもの）。SVG/タイル両方で枠を強調する */
  selectedPrefecture?: string | null;
}

type ViewMode = "thumbnail" | "heatmap";

const HEATMAP_COLORS = [
  "#dbeafe", // blue-100
  "#93c5fd", // blue-300
  "#3b82f6", // blue-500
  "#2563eb", // blue-600
  "#1d4ed8", // blue-700
];

function heatmapFill(count: number, max: number): string {
  if (count === 0 || max <= 0) return "#e5e7eb"; // gray-200
  const ratio = count / max;
  if (ratio <= 0.2) return HEATMAP_COLORS[0];
  if (ratio <= 0.4) return HEATMAP_COLORS[1];
  if (ratio <= 0.6) return HEATMAP_COLORS[2];
  if (ratio <= 0.8) return HEATMAP_COLORS[3];
  return HEATMAP_COLORS[4];
}

function heatmapTextClass(count: number, max: number): string {
  if (count === 0 || max <= 0) return "bg-muted text-muted-foreground/60";
  const ratio = count / max;
  if (ratio <= 0.2) return "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200";
  if (ratio <= 0.4) return "bg-blue-300 text-blue-950 dark:bg-blue-800 dark:text-blue-100";
  if (ratio <= 0.6) return "bg-blue-500 text-white";
  if (ratio <= 0.8) return "bg-blue-600 text-white";
  return "bg-blue-700 text-white";
}

function thumbnailUrl(publicUrl: string, latest: PrefectureLatestImage): string {
  const key = latest.thumbnailKey ?? latest.storageKey;
  return `${publicUrl}/${key}`;
}

/** "北海道" は保持。"東京都"→"東京", "京都府"→"京都", "○○県"→"○○" のみ短縮する */
function shortName(name: string): string {
  if (name === "北海道") return "北海道";
  return name.replace(/(都|府|県)$/, "");
}

const SVG_VIEW_BOX = (japanSvg as { viewBox: string }).viewBox;
const SVG_PATHS = (japanSvg as { paths: Record<string, string> }).paths;

// SVGのフル領域（"0 0 W H"）を分解
const [SVG_X0, SVG_Y0, SVG_W, SVG_H] = SVG_VIEW_BOX.split(/\s+/).map(Number);

// デフォルトのズーム表示領域。fitSizeで余白があるため少し内側にクロップして初期から拡大状態に。
const DEFAULT_VIEW = {
  x: SVG_X0 + SVG_W * 0.1,
  y: SVG_Y0 + SVG_H * 0.05,
  w: SVG_W * 0.8,
  h: SVG_H * 0.8,
};
const MIN_W = SVG_W * 0.15; // 最大ズームイン
const MAX_W = SVG_W * 1.2; // 最大ズームアウト

export function PrefectureHeatmap({
  data,
  publicUrl,
  username,
  selectedPrefecture,
}: PrefectureHeatmapProps) {
  const router = useRouter();
  const [mode, setMode] = useState<ViewMode>("thumbnail");
  const max = Math.max(0, ...Object.values(data).map((e) => e.count));

  const hrefFor = (prefName: string) =>
    `/u/${username}/map?prefecture=${encodeURIComponent(prefName)}`;

  return (
    <div className="w-full space-y-3">
      {/* 表示モード切替 */}
      <div className="flex items-center justify-end gap-1">
        <span className="mr-2 text-[11px] text-muted-foreground">表示</span>
        {(["thumbnail", "heatmap"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
              mode === m
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {m === "thumbnail" ? "サムネイル" : "ヒートマップ"}
          </button>
        ))}
      </div>

      {mode === "thumbnail" ? (
        <TileGrid
          data={data}
          publicUrl={publicUrl}
          max={max}
          hrefFor={hrefFor}
          selectedPrefecture={selectedPrefecture}
        />
      ) : (
        <JapanSvg
          data={data}
          max={max}
          onSelect={(name) => router.push(hrefFor(name))}
          selectedPrefecture={selectedPrefecture}
        />
      )}

      {/* 凡例（ヒートマップ時のみ） */}
      {mode === "heatmap" && max > 0 && (
        <div className="flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
          <span>少</span>
          {HEATMAP_COLORS.map((c) => (
            <div key={c} className="h-2 w-4 rounded" style={{ backgroundColor: c }} />
          ))}
          <span>多（最大 {max} 件）</span>
        </div>
      )}
    </div>
  );
}

/* タイルカルトグラム（サムネイル / ヒートマップ非SVG時の小タイル両用） */
function TileGrid({
  data,
  publicUrl,
  max,
  hrefFor,
  selectedPrefecture,
}: {
  data: PrefectureMapData;
  publicUrl: string;
  max: number;
  hrefFor: (name: string) => string;
  selectedPrefecture?: string | null;
}) {
  const cols = JAPAN_TILE_GRID[0].length;
  return (
    <div
      className="grid w-full gap-1"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      role="grid"
      aria-label="都道府県別投稿のサムネイル地図"
    >
      {JAPAN_TILE_GRID.map((row, rIdx) =>
        row.map((code, cIdx) => {
          if (!code) return <div key={`${rIdx}-${cIdx}`} aria-hidden />;
          const pref = PREFECTURE_BY_CODE[code];
          const entry = data[pref.name];
          const count = entry?.count ?? 0;
          const isSelected = selectedPrefecture === pref.name;
          const title = `${pref.name}: ${count}件`;
          const ring = isSelected ? "ring-2 ring-primary ring-offset-1" : "";

          let inner: React.ReactNode;
          if (entry) {
            inner = (
              <div className={`relative aspect-square overflow-hidden rounded ${ring}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailUrl(publicUrl, entry.latest)}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 text-center text-white">
                  <span className="text-[10px] font-medium leading-tight drop-shadow">{shortName(pref.name)}</span>
                  <span className="text-[9px] leading-tight drop-shadow">{count}</span>
                </div>
              </div>
            );
          } else {
            const tone = heatmapTextClass(count, max);
            inner = (
              <div className={`flex aspect-square min-h-[36px] flex-col items-center justify-center rounded p-0.5 text-center text-[10px] leading-tight ${tone}`}>
                <span className="font-medium">{shortName(pref.name)}</span>
                <span className="text-[9px] opacity-90">{count}</span>
              </div>
            );
          }

          return (
            <div key={`${rIdx}-${cIdx}`} title={title}>
              {entry ? (
                // iOS Safari でセル幅が潰れないよう Link を block 化
                <Link href={hrefFor(pref.name)} className="block h-full w-full">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/* 実際の日本地図SVG（geoMercator投影をビルド時にパス文字列化したものを使用）
   ズームイン/アウトボタンとドラッグ（マウス・タッチ両方）でパン可能 */
function JapanSvg({
  data,
  max,
  onSelect,
  selectedPrefecture,
}: {
  data: PrefectureMapData;
  max: number;
  onSelect: (prefectureName: string) => void;
  selectedPrefecture?: string | null;
}) {
  const [view, setView] = useState(DEFAULT_VIEW);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStart = useRef<{ px: number; py: number; vx: number; vy: number; pid: number } | null>(null);
  // ドラッグ中のクリックを無視するためのフラグ（path.onClick で参照）
  const wasDragging = useRef(false);

  const zoom = (factor: number) => {
    setView((v) => {
      const newW = Math.max(MIN_W, Math.min(MAX_W, v.w * factor));
      const newH = Math.max(MIN_W, Math.min(MAX_W, v.h * factor));
      // 中心を保ったままサイズ変更
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      return { x: cx - newW / 2, y: cy - newH / 2, w: newW, h: newH };
    });
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // ここでは setPointerCapture しない（するとchildのpathにclickが届かなくなる）。
    // 3px以上動いてドラッグ確定したタイミングで初めてcaptureする。
    dragStart.current = {
      px: e.clientX,
      py: e.clientY,
      vx: view.x,
      vy: view.y,
      pid: e.pointerId,
    };
    wasDragging.current = false;
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragStart.current || !svgRef.current) return;
    const dx = e.clientX - dragStart.current.px;
    const dy = e.clientY - dragStart.current.py;
    if (!wasDragging.current) {
      if (Math.hypot(dx, dy) <= 3) return; // 微小な揺れは無視（タップとみなす）
      wasDragging.current = true;
      // ドラッグ確定したのでここでpointer captureして、指がはみ出ても追従させる
      try {
        svgRef.current.setPointerCapture(dragStart.current.pid);
      } catch {
        // 既にcapture済み等は無視
      }
    }
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = view.w / rect.width;
    const scaleY = view.h / rect.height;
    setView((v) => ({
      ...v,
      x: dragStart.current!.vx - dx * scaleX,
      y: dragStart.current!.vy - dy * scaleY,
    }));
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (svgRef.current?.hasPointerCapture?.(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    dragStart.current = null;
    // wasDragging はpath.onClick内で参照後にリセットされるよう、ここでは触らない
  };

  return (
    <div className="relative w-full overflow-hidden rounded-md border bg-muted/20">
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className="block h-auto w-full cursor-grab touch-none select-none active:cursor-grabbing"
        preserveAspectRatio="xMidYMid meet"
        aria-label="都道府県別投稿ヒートマップ"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {Object.entries(SVG_PATHS).map(([code, d]) => {
          const pref = PREFECTURE_BY_CODE[code];
          if (!pref) return null;
          const entry = data[pref.name];
          const count = entry?.count ?? 0;
          const fill = heatmapFill(count, max);
          const isSelected = selectedPrefecture === pref.name;
          const stroke = isSelected ? "#0f172a" : "#ffffff";
          const strokeWidth = isSelected ? 1.5 : 0.5;
          const clickable = !!entry;
          return (
            <path
              key={code}
              d={d}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              style={clickable ? { cursor: "pointer" } : undefined}
              onClick={
                clickable
                  ? () => {
                      if (wasDragging.current) {
                        wasDragging.current = false;
                        return;
                      }
                      onSelect(pref.name);
                    }
                  : undefined
              }
            >
              <title>{`${pref.name}: ${count}件`}</title>
            </path>
          );
        })}
      </svg>

      {/* ズーム操作 */}
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => zoom(0.75)}
          className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm hover:bg-muted"
          aria-label="ズームイン"
          title="ズームイン"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => zoom(1.333)}
          className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm hover:bg-muted"
          aria-label="ズームアウト"
          title="ズームアウト"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setView(DEFAULT_VIEW)}
          className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm hover:bg-muted"
          aria-label="ズームリセット"
          title="リセット"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
