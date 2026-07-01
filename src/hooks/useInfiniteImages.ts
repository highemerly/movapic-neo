"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

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
   * 先頭ページ（カーソルなし）を取得する。指定すると、アプリが再び前面化した
   * ／bfcache から復元されたときに先頭ページを取り直して一覧を作り直す。
   * iOS の standalone PWA は再表示時にリクエストを飛ばさず古いスナップショットを
   * 復元するため、これが無いと手動更新するまで古い内容が残る。
   */
  fetchFirstPage?: () => Promise<InfiniteImagesPage<T>>;
  /** id の重複を除外して追加する（同一画像が複数取得され得る場合に true） */
  dedupe?: boolean;
}

interface UseInfiniteImagesResult<T> {
  images: T[];
  isLoading: boolean;
  nextCursor: string | null;
  loaderRef: RefObject<HTMLDivElement | null>;
}

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
  dedupe = false,
}: UseInfiniteImagesOptions<T>): UseInfiniteImagesResult<T> {
  const [images, setImages] = useState(initialImages);
  const [isLoading, setIsLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  const loaderRef = useRef<HTMLDivElement>(null);

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

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoading) return;

    setIsLoading(true);
    try {
      const data = await fetchPageRef.current(nextCursor);
      setImages((prev) => {
        if (!dedupe) return [...prev, ...data.images];
        const seen = new Set(prev.map((img) => img.id));
        return [...prev, ...data.images.filter((img) => !seen.has(img.id))];
      });
      setNextCursor(data.hasMore ? data.nextCursor : null);
    } catch (error) {
      console.error("Load more error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [nextCursor, isLoading, dedupe]);

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

  // アプリが再前面化／bfcache 復元されたら先頭ページを取り直して一覧を作り直す。
  // fetchFirstPage 未指定なら何もしない（従来どおり）。
  useEffect(() => {
    if (!fetchFirstPage) return;

    // 多重発火（visibilitychange と pageshow が続けて来る等）や連打を抑える。
    let refreshing = false;
    let lastRefreshedAt = 0;
    const MIN_INTERVAL_MS = 3000;

    const refresh = async () => {
      const fn = fetchFirstPageRef.current;
      if (!fn || refreshing) return;
      // performance.now は Date と違い単調増加で環境依存が少ない。
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      if (now - lastRefreshedAt < MIN_INTERVAL_MS) return;
      refreshing = true;
      try {
        const data = await fn();
        lastRefreshedAt = typeof performance !== "undefined" ? performance.now() : 0;
        setImages(data.images);
        setNextCursor(data.hasMore ? data.nextCursor : null);
      } catch (error) {
        console.error("Refresh error:", error);
      } finally {
        refreshing = false;
      }
    };

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
    };
  }, [fetchFirstPage]);

  return { images, isLoading, nextCursor, loaderRef };
}
