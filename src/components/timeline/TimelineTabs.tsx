import Link from "@/components/Link";
import { Globe, Server, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimelineTabsProps {
  /** ログイン中ユーザーの所属サーバードメイン。未ログインなら null */
  ownInstance: string | null;
  /** 現在アクティブなタブ */
  active: "all" | "own" | "favorites";
}

const tab =
  "flex items-center gap-1.5 px-3 py-[13px] text-[13px] font-medium border-b-2 transition-colors";
const activeTab = "border-primary text-primary";
const inactiveTab =
  "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30";

/**
 * 公開タイムライン／お気に入りで共通のタブ（「すべて」／「自分のサーバー」／「お気に入り」）。
 * デザインはユーザーページのタブ（UserProfileHeader）に準拠。
 * いずれも認証必須のため、未ログイン時（ownInstance なし）は行ごと非表示。
 */
export function TimelineTabs({ ownInstance, active }: TimelineTabsProps) {
  if (!ownInstance) return null;

  return (
    <div className="border-b mb-4">
      <nav className="flex gap-0" aria-label="タイムライン切り替え">
        <Link
          href="/public"
          className={cn(tab, active === "all" ? activeTab : inactiveTab)}
        >
          <Globe className="w-4 h-4 shrink-0" />
          <span className={active === "all" ? "inline" : "hidden min-[375px]:inline"}>
            すべて
          </span>
        </Link>
        <Link
          href={`/public?instances=${encodeURIComponent(ownInstance)}`}
          className={cn(tab, active === "own" ? activeTab : inactiveTab)}
        >
          <Server className="w-4 h-4 shrink-0" />
          <span
            className={cn(
              "truncate max-w-[30vw] sm:max-w-[240px]",
              active === "own" ? "inline" : "hidden min-[375px]:inline"
            )}
          >
            {ownInstance}
          </span>
        </Link>
        <Link
          href="/favorite"
          className={cn(tab, active === "favorites" ? activeTab : inactiveTab)}
        >
          <Heart className="w-4 h-4 shrink-0" />
          <span className={active === "favorites" ? "inline" : "hidden min-[375px]:inline"}>
            お気に入り
          </span>
        </Link>
      </nav>
    </div>
  );
}
