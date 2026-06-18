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
  dedupe = false,
}: UseInfiniteImagesOptions<T>): UseInfiniteImagesResult<T> {
  const [images, setImages] = useState(initialImages);
  const [isLoading, setIsLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  const loaderRef = useRef<HTMLDivElement>(null);

  // fetchPage は呼び出し側で毎レンダー再生成されるため、ref に逃がして
  // loadMore / effect の依存を安定させる。
  const fetchPageRef = useRef(fetchPage);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
  }, [fetchPage]);

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

  return { images, isLoading, nextCursor, loaderRef };
}
