import { Settings2, Palette, ShieldCheck, SlidersHorizontal, Trash2, type LucideIcon } from "lucide-react";

type NavItem = { href: string; label: string; Icon: LucideIcon };

// 設定ページ内の各セクションへのジャンプナビ。遷移は全て同一ページ内のハッシュ（#general 等）で完結する。
// 素の <a href="#..."> なので JS 不要。対応する <section id> 側に scroll-mt を付けて sticky ヘッダー/
// ナビにアンカー先が隠れないようにしている（page.tsx 参照）。
const ITEMS: NavItem[] = [
  { href: "#general", label: "一般", Icon: Settings2 },
  { href: "#appearance", label: "外観", Icon: Palette },
  { href: "#privacy", label: "プライバシー・セキュリティ", Icon: ShieldCheck },
  { href: "#defaults", label: "投稿の初期設定", Icon: SlidersHorizontal },
  { href: "#account", label: "アカウント削除", Icon: Trash2 },
];

export function SettingsNav() {
  return (
    // モバイル: ヘッダーはスクロールで消えるので top-0。PC: sticky ヘッダー(h-12)の直下 top-12。
    <nav className="sticky top-0 md:top-12 z-30 -mx-4 mb-4 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {ITEMS.map(({ href, label, Icon }) => (
          <a
            key={href}
            href={href}
            className="flex shrink-0 items-center gap-1.5 rounded-full border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}
