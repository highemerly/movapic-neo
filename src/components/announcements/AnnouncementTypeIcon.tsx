import { Info, AlertTriangle, Megaphone } from "lucide-react";
import type { AnnouncementType } from "@/lib/announcements";

/**
 * お知らせ重要度ごとのアイコン＋色。一覧・詳細・（warning/info のみ）バナーで共通利用し、
 * 各所での三項分岐の重複と "low" 追加漏れを防ぐ。
 */
const META: Record<
  AnnouncementType,
  { Icon: typeof Info; className: string }
> = {
  warning: { Icon: AlertTriangle, className: "text-red-600" },
  info: { Icon: Info, className: "text-blue-600" },
  low: { Icon: Megaphone, className: "text-muted-foreground" },
};

export function AnnouncementTypeIcon({
  type,
  className = "",
}: {
  type: AnnouncementType;
  className?: string;
}) {
  const { Icon, className: colorClass } = META[type] ?? META.info;
  return <Icon className={`${colorClass} ${className}`} />;
}
