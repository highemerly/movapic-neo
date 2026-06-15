import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * アバターの頭の上に「かぶせる」皆勤賞の王冠バッジ（キラキラ演出付き）。
 * 親要素に `relative` を付けた上で配置すること。
 * 王冠本体にはぼかしをかけず、背後のグローとまわりの光だけを動かして
 * くっきり見せたままキラキラさせる。
 */
export function AttendanceCrown({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 leading-none",
        className
      )}
      aria-label="皆勤賞"
      title="皆勤賞"
    >
      {/* 背後で脈打つ金色のグロー（王冠本体はぼかさない） */}
      <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/70 blur-[3px] animate-crown-glow" />
      {/* キラキラ（王冠の上側だけ・アイコンに被らないよう配置） */}
      <span
        className="absolute -top-2 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-amber-100 animate-sparkle"
        style={{ animationDelay: "0s" }}
      />
      <span
        className="absolute -top-1 -left-1 h-[3px] w-[3px] rounded-full bg-yellow-50 animate-sparkle"
        style={{ animationDelay: "0.5s" }}
      />
      <span
        className="absolute -top-1 -right-1 h-[3px] w-[3px] rounded-full bg-amber-50 animate-sparkle"
        style={{ animationDelay: "0.9s" }}
      />
      {/* 王冠本体（くっきり・薄い影で縁取りだけ） */}
      <Crown
        className="relative h-4 w-4 fill-amber-300 text-amber-600 drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]"
        strokeWidth={2.25}
      />
    </span>
  );
}
