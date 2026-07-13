"use client";

import {
  BarChart3,
  Users,
  Server,
  Flag,
  Megaphone,
  Heart,
  Settings,
} from "lucide-react";
import { usePathname } from "next/navigation";

import { TabBar, type TabItem } from "@/components/TabBar";

/**
 * admin 配下の共通タブナビ。デザインはユーザーページ/タイムラインと共通の TabBar。
 * layout は Server Component でパスを持たないため、アクティブ判定はここ（Client）で
 * usePathname により行う。
 */
const TABS: TabItem[] = [
  { key: "stats", label: "統計", icon: BarChart3, href: "/admin/stats" },
  { key: "accounts", label: "アカウント", icon: Users, href: "/admin/accounts" },
  { key: "servers", label: "サーバー", icon: Server, href: "/admin/servers" },
  { key: "reports", label: "通報", icon: Flag, href: "/admin/reports" },
  {
    key: "announcements",
    label: "お知らせ",
    icon: Megaphone,
    href: "/admin/announcements",
  },
  { key: "favorites", label: "お気に入り", icon: Heart, href: "/admin/favorites" },
  { key: "system", label: "システム", icon: Settings, href: "/admin/system" },
];

export function AdminNav() {
  const pathname = usePathname();
  const active =
    TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
      ?.key ?? "";

  return (
    <TabBar
      tabs={TABS}
      activeKey={active}
      responsiveLabels
      ariaLabel="管理メニュー"
      className="mb-6"
    />
  );
}
