"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";

/**
 * インストール済み PWA（standalone）専用の自前 pull-to-refresh。
 *
 * なぜ standalone 限定か:
 * - iOS の standalone PWA にはネイティブの pull-to-refresh が無い（引っ張っても何も起きない）。
 *   なので抑止すべき相手がおらず、独自ジェスチャを素直に載せられる。
 * - Android の standalone PWA はネイティブ PTR があり全リロードしてしまうので
 *   overscroll-behavior-y:contain で抑止し、代わりにこの独自 PTR を効かせる。
 * - ブラウザのタブでは native PTR（＝リロード）をユーザーが期待するので触らない。
 *
 * 引っ張って離すと onRefresh を呼ぶだけ。onRefresh 側（useInfiniteImages.refresh）が
 * reconcile 更新（削除反映＋新着にゅるっと・リロード無し）を行う。
 */

const THRESHOLD = 70; // これ以上引いたら更新（px）
const MAX = 110; // 視覚上の最大引き量（px）
const RESISTANCE = 0.5; // 指の移動量への追従率（重り感）

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari は navigator.standalone、その他は display-mode: standalone。
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    iosStandalone || window.matchMedia("(display-mode: standalone)").matches
  );
}

// standalone はセッション中に変わらないので購読は空。getServerSnapshot=false により
// SSR/ハイドレーション描画では必ず false でサーバと一致し、以後クライアントで確定する。
const emptySubscribe = () => () => {};

export function PullToRefresh({
  onRefresh,
}: {
  onRefresh: () => Promise<void>;
}) {
  const enabled = useSyncExternalStore(
    emptySubscribe,
    detectStandalone,
    () => false
  );
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // イベントハンドラから最新値を読むための ref。
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    let startY = 0;
    let active = false; // このジェスチャで引っ張り判定中か

    const set = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };

    const onTouchStart = (e: TouchEvent) => {
      // 更新中・マルチタッチ・先頭以外は対象外。
      if (refreshingRef.current || e.touches.length !== 1 || window.scrollY > 0) {
        active = false;
        return;
      }
      startY = e.touches[0].clientY;
      active = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active || refreshingRef.current) return;
      // 途中でスクロールが発生したら中断（先頭でのみ引っ張り扱い）。
      if (window.scrollY > 0) {
        active = false;
        set(0);
        return;
      }
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) {
        // 上方向＝下のコンテンツへスクロールしたい意図。ネイティブに任せる。
        set(0);
        return;
      }
      set(Math.min(dy * RESISTANCE, MAX));
      // 引っ張り中はネイティブ overscroll/PTR を抑止（passive:false で登録済み）。
      if (e.cancelable) e.preventDefault();
    };

    const onTouchEnd = async () => {
      if (!active) return;
      active = false;
      if (pullRef.current >= THRESHOLD && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        set(THRESHOLD); // 更新中はしきい値位置でスピナーを保持
        try {
          await onRefreshRef.current();
        } catch {
          // onRefresh 側でログ済み。ここは指標を戻すだけ。
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
          set(0);
        }
      } else {
        set(0);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    // preventDefault するため touchmove だけ passive:false。
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    // Android のネイティブ PTR を抑止（iOS PWA は元々無いので無害）。
    // Chrome は body、Safari は html にしか効かないので両方へ入れる。
    const root = document.documentElement;
    const prevRoot = root.style.overscrollBehaviorY;
    const prevBody = document.body.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "contain";
    document.body.style.overscrollBehaviorY = "contain";

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      root.style.overscrollBehaviorY = prevRoot;
      document.body.style.overscrollBehaviorY = prevBody;
    };
  }, [enabled]);

  if (!enabled || (pull <= 0 && !refreshing)) return null;

  const progress = Math.min(pull / THRESHOLD, 1);
  const offset = Math.min(pull, MAX);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-1/2 top-0 z-50"
      style={{ transform: `translate(-50%, ${offset - 4}px)` }}
    >
      <div
        className="mt-2 flex h-9 w-9 items-center justify-center rounded-full border bg-background shadow-md transition-opacity"
        style={{ opacity: refreshing ? 1 : Math.max(0.4, progress) }}
      >
        <RefreshCw
          className={`h-4 w-4 text-muted-foreground ${refreshing ? "animate-spin" : ""}`}
          style={
            refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }
          }
        />
      </div>
    </div>
  );
}
