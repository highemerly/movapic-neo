"use client";

import { useEffect, useRef, useState } from "react";
import { User, Palette, ShieldCheck, SlidersHorizontal, Lock, type LucideIcon } from "lucide-react";

type NavItem = { href: string; id: string; label: string; Icon: LucideIcon };

// 設定ページ内の各セクションへのジャンプナビ。遷移は同一ページ内のハッシュ（#profile 等）で完結し、
// リンク自体は JS なしでも動く。JS では (1) スクロールに連動した現在地ハイライト（scroll-spy）と
// (2) 見切れているアクティブピルの自動追従、(3) 左右端のフェード表示を担う。
// 並び・id は page.tsx のセクション順／<section id> と一致させる。
const ITEMS: NavItem[] = [
  { href: "#profile", id: "profile", label: "プロフィール", Icon: User },
  { href: "#appearance", id: "appearance", label: "外観", Icon: Palette },
  { href: "#defaults", id: "defaults", label: "投稿の初期設定", Icon: SlidersHorizontal },
  { href: "#privacy", id: "privacy", label: "プライバシー", Icon: ShieldCheck },
  { href: "#account", id: "account", label: "アカウント・セキュリティ", Icon: Lock },
];

export function SettingsNav() {
  const [activeId, setActiveId] = useState<string>(ITEMS[0].id);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pillRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  // scroll-spy: 判定バンド（sticky ヘッダー/ナビの直下）に入っているセクションのうち
  // 最上部のものをアクティブにする。バンドを薄くして切り替えの遅延を抑える。
  useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = ITEMS.find((it) => visible.has(it.id));
        if (first) setActiveId(first.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 }
    );
    for (const it of ITEMS) {
      const el = document.getElementById(it.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  // 左右端フェードの出し分け（スクロール位置・幅から算出）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setCanLeft(el.scrollLeft > 1);
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // アクティブピルが見切れていたら、最小限だけ横スクロールして見える位置に寄せる
  useEffect(() => {
    const container = scrollRef.current;
    const pill = pillRefs.current[activeId];
    if (!container || !pill) return;
    const left = pill.offsetLeft;
    const right = left + pill.offsetWidth;
    if (left < container.scrollLeft) {
      container.scrollTo({ left: left - 16, behavior: "smooth" });
    } else if (right > container.scrollLeft + container.clientWidth) {
      container.scrollTo({ left: right - container.clientWidth + 16, behavior: "smooth" });
    }
  }, [activeId]);

  return (
    // モバイル: ヘッダーはスクロールで消えるので top-0。PC: sticky ヘッダー(h-12)の直下 top-12。
    <nav className="sticky top-0 md:top-12 z-30 -mx-4 mb-4 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="relative">
        {/* 左右端のフェード: まだ続きがあることを示す（スクロール余地があるときだけ表示） */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background to-transparent transition-opacity ${
            canLeft ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent transition-opacity ${
            canRight ? "opacity-100" : "opacity-0"
          }`}
        />
        <div ref={scrollRef} className="flex gap-2 overflow-x-auto no-scrollbar">
          {ITEMS.map(({ href, id, label, Icon }) => {
            const active = id === activeId;
            return (
              <a
                key={href}
                href={href}
                ref={(el) => {
                  pillRefs.current[id] = el;
                }}
                onClick={() => setActiveId(id)}
                aria-current={active ? "true" : undefined}
                className={`relative flex shrink-0 items-center overflow-hidden rounded-full border px-3 py-1.5 text-xs font-medium transition-[border-color] duration-500 ease-out ${
                  active ? "border-primary bg-muted" : "border-border bg-muted hover:bg-accent"
                }`}
              >
                {/* アクティブの塗りは重ねた層の opacity で表現し、切り替えを瞬時でなく徐々にフェードさせる */}
                <span
                  aria-hidden
                  className={`absolute inset-0 bg-primary transition-opacity duration-500 ease-out ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
                <span
                  className={`relative z-10 flex items-center gap-1.5 transition-colors duration-500 ease-out ${
                    active ? "text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
