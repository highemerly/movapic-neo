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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// catalog.ts の icon 文字列 → lucide コンポーネント
const ICONS: Record<string, LucideIcon> = {
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
