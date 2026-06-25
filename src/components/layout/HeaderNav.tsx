"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "@/components/Link";
import { getPrimaryNavItems, type PrimaryNavContext } from "./primaryNav";

/**
 * PC幅（md+）のヘッダー右側に出す主要動線のインラインナビ（アイコンのみ）。
 *
 * 狭い画面では非表示（`hidden md:flex`）＝従来どおりハンバーガーに集約。
 * PWAの下部ナビが出ないPCブラウザでも、みんな／サーバー／お気に入り／マイページに
 * 1クリックで行けるようにするのが目的。定義は BottomNav と共有（primaryNav）。
 *
 * useSearchParams を使うため、呼び出し側（SiteHeader）で <Suspense> 境界に包むこと。
 */
export function HeaderNav(ctx: PrimaryNavContext) {
  const pathname = usePathname();
  const hasInstancesParam = useSearchParams().has("instances");
  const items = getPrimaryNavItems(ctx);

  return (
    <nav aria-label="主要メニュー" className="hidden md:flex items-center gap-1">
      {items.map(({ key, href, label, Icon, isActive }) => {
        const active = isActive(pathname, hasInstancesParam);
        return (
          <Link
            key={key}
            href={href}
            title={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
              active
                ? "bg-accent text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Icon className="h-5 w-5" />
          </Link>
        );
      })}
    </nav>
  );
}
