"use client";

import {
  BarChart3,
  Users,
  Server,
  Flag,
  Megaphone,
  Heart,
  Settings,
  ChevronDown,
} from "lucide-react";
import { usePathname } from "next/navigation";

import Link from "@/components/Link";
import { TabBar, type TabItem } from "@/components/TabBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * admin 配下の共通タブナビ。
 *
 * - PC（md 以上）: ユーザーページ/タイムラインと共通の TabBar（横並びタブ）。
 * - スマホ（md 未満）: 項目が7つと多く横スクロールになり見づらいため、
 *   「現在のページ名」をトリガーにしたドロップダウンで切り替える。
 *
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
  const activeTab = TABS.find(
    (t) => pathname === t.href || pathname.startsWith(`${t.href}/`),
  );
  const ActiveIcon = activeTab?.icon;

  return (
    <>
      {/* PC: 横並びタブ */}
      <div className="mb-6 hidden md:block">
        <TabBar tabs={TABS} activeKey={activeTab?.key ?? ""} ariaLabel="管理メニュー" />
      </div>

      {/* スマホ: 現在地ドロップダウン */}
      <div className="mb-6 border-b pb-3 md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 text-base font-semibold text-foreground"
              aria-label="管理メニュー"
            >
              {ActiveIcon && <ActiveIcon className="h-4 w-4 shrink-0" />}
              <span>{activeTab?.label ?? "管理メニュー"}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.key === activeTab?.key;
              return (
                <DropdownMenuItem key={tab.key} asChild>
                  <Link
                    href={tab.href}
                    className={cn(
                      "flex items-center gap-2",
                      isActive && "text-brand font-medium",
                    )}
                  >
                    {Icon && <Icon className="h-4 w-4 shrink-0" />}
                    {tab.label}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
