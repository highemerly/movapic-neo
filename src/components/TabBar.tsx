import type { LucideIcon } from "lucide-react";

import Link from "@/components/Link";
import { cn } from "@/lib/utils";

export interface TabItem {
  /** アクティブ判定に使う一意キー */
  key: string;
  label: string;
  href: string;
  /** 省略時はラベルのみ（管理画面の一部など） */
  icon?: LucideIcon;
  /** ラベル横に出す小バッジ（例: NEW） */
  badge?: string;
}

interface TabBarProps {
  tabs: TabItem[];
  activeKey: string;
  /** 主要動線のみ RSC プリフェッチを有効化（既定は無効） */
  prefetch?: boolean;
  /**
   * 非アクティブタブのラベルを狭幅で隠しアイコンのみにする。
   * アイコン付きの少数タブ（ユーザーページ/タイムライン）向け。
   * false ならラベル常時表示（アイコン無しで数が多い管理画面向け）。
   */
  responsiveLabels?: boolean;
  /**
   * responsiveLabels でラベルを隠す上限幅。
   * "xs"（<375px）は3タブ程度向け、"md"（<768px）はタブ数が多く狭幅で溢れるユーザーページ向け。
   * Tailwind JIT にクラスを拾わせるため、生成クラスはリテラルの対応表で持つ。
   */
  labelBreakpoint?: "xs" | "md";
  ariaLabel?: string;
  /** コンテナ（border-b 付き）への追加クラス。余白調整用。 */
  className?: string;
}

const tabClass =
  "flex items-center gap-1.5 py-[13px] text-sm font-medium border-b-2 transition-colors whitespace-nowrap";
const activeClass = "border-brand text-brand";
const inactiveClass =
  "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30";

/**
 * アンダーライン型のタブナビゲーション（アクティブは brand 下線）。
 *
 * ユーザーページ（UserProfileHeader）・公開タイムライン（TimelineTabs）・
 * 管理画面（AdminNav）で共通利用する。以前は各所でスタイルを手書き複製していた。
 * 状態を持たず activeKey を props で受けるだけなので Server/Client どちらからも使える。
 */
// responsiveLabels 時に非アクティブラベルを隠すクラス（リテラルで持ちJITに拾わせる）。
const LABEL_HIDE_CLASS: Record<"xs" | "md", string> = {
  xs: "hidden min-[375px]:inline",
  md: "hidden md:inline",
};

// ラベルを隠す幅ではアイコンのみで押しづらいので、その幅だけ左右パディングを広げる
// （ラベルが出る幅に戻ったら通常の px-3）。responsiveLabels 無効なら常に px-3。
// md は5タブあり、超狭幅(<375px)だと px-4 では溢れるので、そこだけ更に詰める。
const PADDING_CLASS: Record<"xs" | "md", string> = {
  xs: "px-4 min-[375px]:px-3",
  md: "px-2.5 min-[375px]:px-4 md:px-3",
};

export function TabBar({
  tabs,
  activeKey,
  prefetch = false,
  responsiveLabels = false,
  labelBreakpoint = "xs",
  ariaLabel = "Tabs",
  className,
}: TabBarProps) {
  return (
    <div className={cn("border-b", className)}>
      <nav className="flex gap-0 overflow-x-auto" aria-label={ariaLabel}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeKey === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              prefetch={prefetch}
              className={cn(
                tabClass,
                responsiveLabels ? PADDING_CLASS[labelBreakpoint] : "px-3",
                isActive ? activeClass : inactiveClass,
              )}
            >
              {Icon && <Icon className="w-4 h-4 shrink-0" />}
              <span
                className={cn(
                  !isActive &&
                    responsiveLabels &&
                    LABEL_HIDE_CLASS[labelBreakpoint],
                )}
              >
                {tab.label}
              </span>
              {tab.badge && (
                <span className="ml-0.5 rounded-full bg-amber-100 px-1.5 py-0 text-[9px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  {tab.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
