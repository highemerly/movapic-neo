"use client";

import {
  Trophy,
  Images,
  Flame,
  Zap,
  Sparkles,
  Stamp,
  ALargeSmall,
  GalleryVerticalEnd,
  Camera,
  Map as MapIcon,
  Star,
  Pilcrow,
  Palette,
  Type,
  Mail,
  AtSign,
  MapPin,
  Crown,
  Lock,
  Sunrise,
  Moon,
  EyeOff,
  Rocket,
} from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

// サッカーボール（lucide にないので同じ線画スタイルで自作。ハットトリック実績用）
function SoccerBall({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8.2 L15.62 10.83 L14.23 15.07 L9.77 15.07 L8.39 10.83 Z" />
      <path d="M12 8.2 V2" />
      <path d="M15.62 10.83 L21.51 8.91" />
      <path d="M14.23 15.07 L17.88 20.09" />
      <path d="M9.77 15.07 L6.12 20.09" />
      <path d="M8.39 10.83 L2.49 8.91" />
    </svg>
  );
}

// catalog.ts の icon 文字列 → lucide コンポーネント（一部は自作SVG）
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Trophy,
  Images,
  Flame,
  Zap,
  Sparkles,
  Stamp,
  ALargeSmall,
  GalleryVerticalEnd,
  Camera,
  Map: MapIcon,
  Star,
  Pilcrow,
  Palette,
  Type,
  Mail,
  AtSign,
  MapPin,
  Crown,
  Lock,
  Sunrise,
  Moon,
  EyeOff,
  Rocket,
  SoccerBall,
};

export function AchievementIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = ICONS[name] ?? Trophy;
  return <Icon className={cn("h-5 w-5", className)} />;
}
