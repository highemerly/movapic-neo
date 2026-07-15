"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { reconcileTimeline } from "@/lib/pagination";

// SSR では useLayoutEffect が警告を出すため、クライアントでのみ layout 版を使う。
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface InfiniteImagesPage<T> {
  images: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface UseInfiniteImagesOptions<T> {
  /** SSR で渡された初期画像 */
  initialImages: T[];
  /** 初期カーソル（null なら追加読み込みなし） */
  initialCursor: string | null;
  /** カーソルを受け取り次ページを取得する */
  fetchPage: (cursor: string) => Promise<InfiniteImagesPage<T>>;
  /**
   * 先頭ページ（カーソルなし・最新順）を取得する。指定すると、再前面化／bfcache 復元／
   * 永続化復元のときにこれを取り直し、その時間窓に入る head を新鮮な結果で作り直す
   * （reconcile）。窓より古い tail は残してスクロール位置・読み込み済みを保つ。新着は
   * 先頭へ足して入場アニメ、削除・非公開・編集は反映される。未指定なら更新しない。
   */
  fetchFirstPage?: () => Promise<InfiniteImagesPage<T>>;
  /**
   * images / nextCursor が変わるたびに呼ばれる。クライアント側の永続化
   * （sessionStorage への保存）に使う。
   */
  onChange?: (images: T[], nextCursor: string | null) => void;
  /**
   * 永続化（sessionStorage）からの復元スナップショットを返す。マウント後に一度だけ
   * 呼ばれ、非 null なら SSR 初期値を上書きして一覧を作り直し、続けて差分更新を走らせる。
   * ハイドレーション不整合を避けるため復元は初期レンダーではなくマウント後に適用する。
   */
  restore?: () => { images: T[]; nextCursor: string | null } | null;
  /** id の重複を除外して追加する（同一画像が複数取得され得る場合に true） */
  dedupe?: boolean;
  /**
   * 表示から除外する要素を落とすフィルタ（true=残す）。ミュートのクライアント側除外に使う。
   * サーバーのページカーソル（nextCursor）は生の応答基準のまま保つため、フィルタで
   * 件数が減ってもページングは壊れない（loaderRef が見え続ければ次ページを自動取得して埋める）。
   */
  filterItem?: (item: T) => boolean;
}

interface UseInfiniteImagesResult<T> {
  images: T[];
  isLoading: boolean;
  nextCursor: string | null;
  loaderRef: RefObject<HTMLDivElement | null>;
  /** 直近の更新で新しく先頭に加わった id 群（にゅるっと追加アニメ用）。数百ms後に空へ戻る。 */
  newIds: ReadonlySet<string>;
  /**
   * 先頭から離れてスクロール中に、更新で先頭へ積まれた新着の累計件数。「N件の新着」ピル用。
   * 先頭付近へ戻る（or clearNewCount）と 0 に戻る。先頭付近での更新（PTR等）では増えない
   * （新着はその場で見えるため）。
   */
  newCount: number;
  /** 新着ピルを消す（タップで先頭へ移動したとき等に呼ぶ）。 */
  clearNewCount: () => void;
  /**
   * 手動更新（自前 pull-to-refresh 用）。再前面化と同じ reconcile を走らせる。
   * ユーザー操作なので連打スロットルを飛ばす（force）。完了まで待てる Promise を返す。
   * fetchFirstPage 未指定なら何もしない。
   */
  refresh: () => Promise<void>;
}

// この位置より下（px）にスクロールしている時に来た新着だけ「N件の新着」ピルに積む
// （先頭付近なら新着はその場で見えるのでピルは不要）。
const NEW_PILL_MIN_SCROLL = 500;

/**
 * カーソルベースの無限スクロール共通フック。
 * IntersectionObserver で loaderRef がビューポートに入ると次ページを取得する。
 * 公開タイムライン / お気に入り / ユーザー画像の各クライアントで共有する。
 */
export function useInfiniteImages<T extends { id: string }>({
  initialImages,
  initialCursor,
  fetchPage,
  fetchFirstPage,
  onChange,
  restore,
  dedupe = false,
  filterItem,
}: UseInfiniteImagesOptions<T>): UseInfiniteImagesResult<T> {
  // filterItem は毎レンダー再生成されうるため ref に逃がす。フィルタ適用時に呼ぶだけで
  // 依存配列には入れない（keep が変わっても既存表示は作り直さない＝画面のちらつきを避ける）。
  const filterRef = useRef(filterItem);
  useEffect(() => {
    filterRef.current = filterItem;
  }, [filterItem]);
  const keep = useCallback((items: T[]) => {
    const fn = filterRef.current;
    return fn ? items.filter(fn) : items;
  }, []);

  // 初期値は ref ではなくプロップを直接使う（レンダー中に ref を読まない）。
  const [images, setImages] = useState(() =>
    filterItem ? initialImages.filter(filterItem) : initialImages
  );
  const [isLoading, setIsLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  // 更新で新しく先頭に加わった id 群。CSS の入場アニメを当てるためだけの一時状態。
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(() => new Set());
  // スクロール中に積まれた新着の累計（「N件の新着」ピル用）。
  const [newCount, setNewCount] = useState(0);
  const clearNewCount = useCallback(() => setNewCount(0), []);
  const loaderRef = useRef<HTMLDivElement>(null);

  // 先頭付近へ戻ったら新着ピルを消す（スクロールで自然に見えたら不要になるため）。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => {
      if (window.scrollY < 120) setNewCount(0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // refresh() は非同期イベントハンドラから現在の images 先頭 id を読むため ref に同期する。
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // fetchPage / fetchFirstPage は呼び出し側で毎レンダー再生成されるため、
  // ref に逃がして loadMore / effect の依存を安定させる。
  const fetchPageRef = useRef(fetchPage);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
  }, [fetchPage]);

  const fetchFirstPageRef = useRef(fetchFirstPage);
  useEffect(() => {
    fetchFirstPageRef.current = fetchFirstPage;
  }, [fetchFirstPage]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const restoreRef = useRef(restore);
  useEffect(() => {
    restoreRef.current = restore;
  }, [restore]);

  // images / nextCursor が変わるたびに永続化コールバックへ通知する（保存はコールバック側で間引く）。
  useEffect(() => {
    onChangeRef.current?.(images, nextCursor);
  }, [images, nextCursor]);

  // 更新効果の内部 refresh を手動更新（自前PTR）から叩くための橋渡し。
  const refreshRef = useRef<((force?: boolean) => Promise<void>) | null>(null);

  // prepend した id のアニメ印は一定時間後に外す（DOM は残し class だけ落とす）。
  const clearNewIdsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (clearNewIdsTimer.current) clearTimeout(clearNewIdsTimer.current);
    };
  }, []);

  // 更新（reconcile）で head の高さが変わってもスクロール位置がずれないよう、反映直前の
  // 高さ/位置を控え、DOM 反映後に増減分だけ scrollTop を補正する。新着追加（増）でも削除
  // （減）でも見た目の位置を保つ。先頭付近（scrollY≈0）のときは補正しない＝新着が下へ
  // 押し出される「にゅるっと追加」を見せる。
  const pendingScrollAdjust = useRef<{ scrollY: number; height: number } | null>(null);
  useIsomorphicLayoutEffect(() => {
    const p = pendingScrollAdjust.current;
    if (!p || typeof window === "undefined") return;
    pendingScrollAdjust.current = null;
    const delta = document.documentElement.scrollHeight - p.height;
    if (p.scrollY > 4 && delta !== 0) {
      window.scrollTo(0, Math.max(0, p.scrollY + delta));
    }
  }, [images]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoading) return;

    setIsLoading(true);
    try {
      const data = await fetchPageRef.current(nextCursor);
      const incoming = keep(data.images);
      setImages((prev) => {
        if (!dedupe) return [...prev, ...incoming];
        const seen = new Set(prev.map((img) => img.id));
        return [...prev, ...incoming.filter((img) => !seen.has(img.id))];
      });
      setNextCursor(data.hasMore ? data.nextCursor : null);
    } catch (error) {
      console.error("Load more error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [nextCursor, isLoading, dedupe, keep]);

  useEffect(() => {
    const loader = loaderRef.current;
    if (!loader || !nextCursor) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(loader);
    return () => observer.disconnect();
  }, [nextCursor, loadMore]);

  // アプリが再前面化／bfcache 復元／永続化復元のときに「更新」する。
  //
  // 単純な prepend（新着追加のみ）では、削除・非公開・編集がサーバで起きても既存表示に
  // 残り続ける（追加はできても除去・更新ができない）。そこで最新ページを取り直し、その
  // 時間窓に入る head を新鮮な結果で作り直す（reconcile）。窓より古い tail は残してスク
  // ロール位置と読み込み済みを保つ。これで「にゅるっと追加」を維持しつつ、削除等が反映
  // される。fetchFirstPage 未指定なら何もしない。
  useEffect(() => {
    if (!fetchFirstPage) return;

    // 多重発火（visibilitychange と pageshow が続けて来る等）や連打を抑える。
    // 初期値を -∞ にするのは、ページ読込直後（performance.now() が MIN_INTERVAL 未満）でも
    // 復元起点のマウント時 refresh を握り潰さないため（0 だと早期の now-0 < 3000 で skip される）。
    let refreshing = false;
    let lastRefreshedAt = Number.NEGATIVE_INFINITY;
    const MIN_INTERVAL_MS = 3000;

    // 反映直前の高さ/位置を控える（useIsomorphicLayoutEffect が反映後にスクロール補正）。
    const markScroll = () => {
      if (typeof window !== "undefined") {
        pendingScrollAdjust.current = {
          scrollY: window.scrollY,
          height: document.documentElement.scrollHeight,
        };
      }
    };

    const flashNewIds = (ids: Set<string>) => {
      if (ids.size === 0) return;
      setNewIds(ids);
      if (clearNewIdsTimer.current) clearTimeout(clearNewIdsTimer.current);
      clearNewIdsTimer.current = setTimeout(() => setNewIds(new Set()), 700);
    };

    // 最新ページ（サーバ真実）で head を作り直す。tail（窓より古い既存要素）は維持する。
    // マージ判定は純粋ロジック reconcileTimeline に委譲（テスト済み）。
    const reconcile = (page: InfiniteImagesPage<T>) => {
      const res = reconcileTimeline(
        imagesRef.current,
        keep(page.images),
        page.hasMore,
        page.nextCursor
      );
      markScroll();
      setImages(res.images);
      if (!res.keepCursor) setNextCursor(res.cursor);
      flashNewIds(res.newIds);
      // 先頭から離れている時の新着は「N件の新着」ピルに積む（先頭付近ならその場で見える）。
      if (
        res.newIds.size > 0 &&
        typeof window !== "undefined" &&
        window.scrollY > NEW_PILL_MIN_SCROLL
      ) {
        setNewCount((c) => c + res.newIds.size);
      }
    };

    // force=true は連打スロットルを飛ばす（ユーザー操作の pull-to-refresh 用）。
    // 同時実行ガード（refreshing）は force でも維持する。
    const refresh = async (force = false) => {
      if (refreshing) return;
      // performance.now は Date と違い単調増加で環境依存が少ない。
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      if (!force && now - lastRefreshedAt < MIN_INTERVAL_MS) return;
      refreshing = true;
      try {
        const first = fetchFirstPageRef.current;
        if (first) reconcile(await first());
        lastRefreshedAt = typeof performance !== "undefined" ? performance.now() : 0;
      } catch (error) {
        console.error("Refresh error:", error);
      } finally {
        refreshing = false;
      }
    };
    // 手動更新（自前PTR）から叩けるよう ref に載せる。
    refreshRef.current = refresh;

    // マウント後に永続化スナップショットを適用する（ハイドレーション不整合を避けるため
    // 初期レンダーではなくここで上書きする）。復元後に必ず reconcile を走らせ、離席中の
    // 削除・新着をサーバ真実で取り込む（＝古い削除済み画像が居座らない）。
    const snap = restoreRef.current?.();
    if (snap && snap.images.length > 0) {
      const restored = keep(snap.images);
      imagesRef.current = restored;
      setImages(restored);
      setNextCursor(snap.nextCursor);
      refresh();
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    // bfcache から復元された場合（iOS PWA でのスナップショット復元含む）。
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      refreshRef.current = null;
    };
    // マウント時に一度だけ実行する（fetch/keep/restore はすべて ref 経由）。呼び出し側は
    // fetch 系を毎レンダー再生成するため、依存に入れるとリスナ再登録と復元の多重実行を招く。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 手動更新の安定した公開ハンドル（自前 pull-to-refresh から呼ぶ）。
  const refresh = useCallback(() => refreshRef.current?.(true) ?? Promise.resolve(), []);

  return {
    images,
    isLoading,
    nextCursor,
    loaderRef,
    newIds,
    newCount,
    clearNewCount,
    refresh,
  };
}
