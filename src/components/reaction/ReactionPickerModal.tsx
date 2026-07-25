"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RetryImg } from "@/components/RetryImg";
import { ReactionEmojiView } from "./ReactionEmojiView";
import { loadRecentReactions, pushRecentReaction, type RecentReaction } from "./recentReactions";

interface PaletteItem {
  key: string;
  imageUrl: string | null;
  label: string;
}

interface PaletteSection {
  id: string;
  label: string;
  icon: string | null;
  iconUrl: string | null;
  emojis: PaletteItem[];
}

// 「最近使った」セクションのID（サーバーではなくローカルの localStorage から組む）
const RECENT_ID = "recent";
const SEARCH_DEBOUNCE_MS = 250;

// セクション遅延マウントの見積り。ダイアログは狭い（sm:max-w-sm＝24rem）ので実測に近い概算で、
// マウント前プレースホルダの高さを絵文字数から算出する。多少ずれても jumpToの着地が
// 少し甘くなるだけで実害はない（スクロールバーの高さを安定させ、ジャンプ精度を保つのが目的）。
const EMOJI_BTN_ROW_H = 46; // h-11(44px)+gap-0.5(2px)
const EMOJI_PER_ROW = 6;
// 開いた瞬間に確実に中身を見せるため、先頭からこの数のセクションは IO を待たず即マウントする。
const EAGER_SECTIONS = 2;

export function ReactionPickerModal({
  open,
  onOpenChange,
  onPick,
  currentEmoji,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 選択されたリアクション。同じ絵文字をもう一度選んだ場合の扱いは呼び出し側に任せる */
  onPick: (emoji: string, imageUrl: string | null) => void;
  currentEmoji: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 中身は開いている間だけマウントされる（開閉ごとに効くエフェクトを持たなくて済む）。 */}
      <DialogContent className="sm:max-w-sm">
        <PickerBody
          currentEmoji={currentEmoji}
          onPick={(emoji, imageUrl) => {
            onPick(emoji, imageUrl);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({
  currentEmoji,
  onPick,
}: {
  currentEmoji: string | null;
  onPick: (emoji: string, imageUrl: string | null) => void;
}) {
  const [sections, setSections] = useState<PaletteSection[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [query, setQuery] = useState("");
  const [searchItems, setSearchItems] = useState<PaletteItem[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentReaction[]>(loadRecentReactions);

  const scrollRef = useRef<HTMLDivElement>(null);
  // 各セクション要素（ジャンプ先）
  const sectionRefs = useRef(new Map<string, HTMLElement>());

  // 初回: 全セクションを取得
  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/v1/reactions/palette");
        if (!response.ok) {
          setError("リアクションの一覧を取得できませんでした");
          return;
        }
        const data = await response.json();
        setSections(data.sections ?? []);
        setTruncated(!!data.truncated);
      } catch {
        setError("リアクションの一覧を取得できませんでした");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 検索（デバウンス）
  const isFirst = useRef(true);
  const runSearch = useCallback(async (q: string) => {
    try {
      const response = await fetch(`/api/v1/reactions/palette?q=${encodeURIComponent(q)}`);
      if (!response.ok) return;
      const data = await response.json();
      setSearchItems(data.emojis ?? []);
      setSearchTotal(data.total ?? 0);
    } catch {
      // 検索失敗時は空表示（致命ではない）
      setSearchItems([]);
    }
  }, []);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    const q = query.trim();
    // 空クエリのときは検索結果を触らない（表示側が searching=false でこれを参照しないため、
    // 古い結果が残っても見えない。次の検索で上書きされる）。
    if (!q) return;
    const timer = setTimeout(() => void runSearch(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const pick = (emoji: string, imageUrl: string | null) => {
    setRecent(pushRecentReaction({ emoji, imageUrl }));
    onPick(emoji, imageUrl);
  };

  const jumpTo = (id: string) => {
    const el = sectionRefs.current.get(id);
    const container = scrollRef.current;
    if (!el || !container) return;
    // 見出しが sticky なので scrollIntoView だと下端に寄ってしまう。コンテナ基準の相対位置を
    // 測って、セクションの上端がコンテナ最上部に来るよう scrollTop を合わせる。
    const delta = el.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTo({ top: container.scrollTop + delta, behavior: "smooth" });
  };

  const searching = query.trim() !== "";

  // 「最近使った」を先頭セクションとして合成（localStorage 由来）
  const recentSection: PaletteSection | null =
    recent.length > 0
      ? {
          id: RECENT_ID,
          label: "最近使った",
          icon: null,
          iconUrl: null,
          emojis: recent.map((item) => ({
            key: item.emoji,
            imageUrl: item.imageUrl,
            label: item.emoji,
          })),
        }
      : null;
  const allSections = recentSection ? [recentSection, ...sections] : sections;

  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle>
          {currentEmoji ? "リアクションを変更する" : "リアクションを追加する"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          絵文字を選んでこの投稿にリアクションします
        </DialogDescription>
      </DialogHeader>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="絵文字を検索"
          className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>

      {error && <p className="text-sm text-muted-foreground">{error}</p>}

      {searching ? (
        // 検索中は1リスト表示
        <div className="min-h-[12rem] max-h-[50vh] overflow-y-auto overflow-x-hidden">
          {searchItems.length > 0 ? (
            <>
              <EmojiGrid>
                {searchItems.map((item) => (
                  <EmojiButton
                    key={item.key}
                    item={item}
                    selected={item.key === currentEmoji}
                    onClick={() => pick(item.key, item.imageUrl)}
                  />
                ))}
              </EmojiGrid>
              {searchTotal > searchItems.length && (
                <p className="mt-2 text-xs text-muted-foreground">
                  ほか{searchTotal - searchItems.length}件。絞り込むと見つけやすくなります。
                </p>
              )}
            </>
          ) : (
            <p className="pt-2 text-sm text-muted-foreground">一致する絵文字がありません</p>
          )}
        </div>
      ) : (
        // 通常は「左のジャンプナビ ＋ 全セクション縦スクロール」
        <div className="flex gap-2">
          <nav className="flex max-h-[50vh] shrink-0 flex-col gap-0.5 overflow-y-auto pr-1">
            {allSections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => jumpTo(section.id)}
                title={section.label}
                className="flex h-8 w-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-accent"
              >
                <JumpIcon section={section} />
              </button>
            ))}
          </nav>

          <div
            ref={scrollRef}
            className="min-h-[12rem] max-h-[50vh] flex-1 overflow-y-auto overflow-x-hidden"
          >
            {loading ? (
              <p className="pt-2 text-sm text-muted-foreground">読み込み中…</p>
            ) : (
              <>
                {allSections.map((section, index) => (
                  <LazyEmojiSection
                    key={section.id}
                    section={section}
                    currentEmoji={currentEmoji}
                    onPick={pick}
                    scrollRef={scrollRef}
                    // 一括マウントによる開いた瞬間のフリーズを避けるため、画面に来たセクションだけ
                    // 中身を描画する。先頭数セクションは IO のコールバック待ちの空白を避けて即マウント。
                    eager={index < EAGER_SECTIONS}
                    registerRef={(el) => {
                      if (el) sectionRefs.current.set(section.id, el);
                      else sectionRefs.current.delete(section.id);
                    }}
                  />
                ))}
                {truncated && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    サーバーの絵文字が多いため一部のみ表示しています。検索で探せます。
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * セクション1つ。見出しは常に描画し、絵文字ボタン群はビューポート付近に来たときだけマウントする
 * （数千個の EmojiButton を一括マウントするとメインスレッドが固まり「開くのが遅い」体感になるため）。
 * 一度マウントしたら保持し続ける（スクロールを戻したときの再マウント/ちらつきを避ける）。
 */
function LazyEmojiSection({
  section,
  currentEmoji,
  onPick,
  scrollRef,
  registerRef,
  eager,
}: {
  section: PaletteSection;
  currentEmoji: string | null;
  onPick: (emoji: string, imageUrl: string | null) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  registerRef: (el: HTMLElement | null) => void;
  eager: boolean;
}) {
  const [shown, setShown] = useState(eager);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      // スクロール前に先読みでマウントして、到達時に空白が見えないようにする
      { root: scrollRef.current, rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown, scrollRef]);

  // マウント前のプレースホルダ高さ＝絵文字数から概算。スクロールバー高とジャンプ着地を安定させる。
  const placeholderHeight =
    Math.ceil(section.emojis.length / EMOJI_PER_ROW) * EMOJI_BTN_ROW_H;

  return (
    <section
      ref={(el) => {
        ref.current = el;
        registerRef(el);
      }}
      className="mb-2"
    >
      <h3 className="sticky top-0 z-10 bg-background/95 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
        {section.label}
      </h3>
      {shown ? (
        <EmojiGrid>
          {section.emojis.map((item) => (
            <EmojiButton
              key={item.key}
              item={item}
              selected={item.key === currentEmoji}
              onClick={() => onPick(item.key, item.imageUrl)}
            />
          ))}
        </EmojiGrid>
      ) : (
        <div aria-hidden style={{ height: placeholderHeight }} />
      )}
    </section>
  );
}

function JumpIcon({ section }: { section: PaletteSection }) {
  if (section.id === "recent") {
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
  if (section.iconUrl) {
    return (
      <RetryImg src={section.iconUrl} alt={section.label} className="h-5 w-5 object-contain" />
    );
  }
  if (section.icon) {
    return <ReactionEmojiView emoji={section.icon} />;
  }
  return <span className="text-xs text-muted-foreground">{section.label.charAt(0)}</span>;
}

function EmojiGrid({ children }: { children: React.ReactNode }) {
  // 絵文字は大きめ・隙間は詰める
  return <div className="flex flex-wrap gap-0.5">{children}</div>;
}

function EmojiButton({
  item,
  selected,
  onClick,
}: {
  item: PaletteItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={item.label}
      aria-pressed={selected}
      className={`flex h-11 w-11 items-center justify-center rounded-md text-2xl transition-colors ${
        selected ? "bg-accent ring-1 ring-foreground/40" : "hover:bg-accent"
      }`}
    >
      <ReactionEmojiView emoji={item.key} imageUrl={item.imageUrl} />
    </button>
  );
}
