import { Globe, Server, Heart } from "lucide-react";

import { TabBar, type TabItem } from "@/components/TabBar";

interface TimelineTabsProps {
  /** ログイン中ユーザーの所属サーバードメイン。未ログインなら null */
  ownInstance: string | null;
  /** 現在アクティブなタブ */
  active: "all" | "own" | "favorites";
}

/**
 * 公開タイムライン／お気に入りで共通のタブ（「みんな」／「同じサーバー」／「お気に入り」）。
 * デザインはユーザーページのタブと共通の TabBar に準拠。
 * いずれも認証必須のため、未ログイン時（ownInstance なし）は行ごと非表示。
 */
export function TimelineTabs({ ownInstance, active }: TimelineTabsProps) {
  if (!ownInstance) return null;

  const tabs: TabItem[] = [
    { key: "all", label: "みんな", icon: Globe, href: "/public" },
    {
      key: "own",
      label: "同じサーバー",
      icon: Server,
      href: `/public?instances=${encodeURIComponent(ownInstance)}`,
    },
    { key: "favorites", label: "お気に入り", icon: Heart, href: "/favorite" },
  ];

  return (
    <TabBar
      tabs={tabs}
      activeKey={active}
      responsiveLabels
      ariaLabel="タイムライン切り替え"
      className="mb-4"
    />
  );
}
