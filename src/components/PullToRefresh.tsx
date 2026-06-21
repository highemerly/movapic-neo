"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";

// iOS のホーム画面アプリ（standalone）かどうか。iOS だけに存在する
// navigator.standalone を見る。SSRでは false（サーバーで navigator は無い）。
const subscribeNoop = () => () => {};
const getIsIosStandalone = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const THRESHOLD = 90; // この距離まで引っ張ったら更新（px。大きいほど重い＝要・強く引く）
const MAX_PULL = 130; // インジケータが進む最大距離（px）
const PULL_FACTOR = 0.5; // 指の移動量→インジケータ移動量の比（小さいほど重い）
const BASE_OFFSET = 48; // 待機位置（画面外）への引き上げ量（px）
// 発動に必要な指の実移動量 ≒ THRESHOLD / PULL_FACTOR（現状 約180px）

/**
 * iOSのホーム画面アプリ（standalone）向けの「引っ張って更新」UI。
 *
 * iOS Safari は通常タブだとネイティブの pull-to-refresh が効くが、ホーム画面に
 * 追加したPWA（standalone）では無効になり、リロード手段が無くなる。そこで上端で
 * 下方向に引っ張るジェスチャを自前で拾い、しきい値を超えたら location.reload する。
 *
 * Android のPWAはネイティブの pull-to-refresh があるため対象外（二重発火を避ける）。
 * 判定には iOS だけに存在する `navigator.standalone` を使う（=== true で iOS PWA）。
 */
export function PullToRefresh() {
  const enabled = useSyncExternalStore(
    subscribeNoop,
    getIsIosStandalone,
    () => false,
  );
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // タッチハンドラ内から最新値を読むための ref（リスナーの貼り直しを避ける）
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const startYRef = useRef<number | null>(null);
  const activeRef = useRef(false);

  const updatePull = (v: number) => {
    pullRef.current = v;
    setPull(v);
  };

  useEffect(() => {
    if (!enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      // ページ最上部にいて、更新中でないときだけジェスチャ開始候補にする
      if (window.scrollY > 0 || refreshingRef.current) {
        startYRef.current = null;
        return;
      }
      startYRef.current = e.touches[0].clientY;
      activeRef.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startYRef.current;
      // 上方向 or すでにスクロールしている場合は通常スクロールに戻す
      if (dy <= 0 || window.scrollY > 0) {
        if (activeRef.current) {
          activeRef.current = false;
          updatePull(0);
        }
        return;
      }
      // 上端で下方向 → 自前インジケータを引く。iOSのバウンスは止める。
      activeRef.current = true;
      e.preventDefault();
      // 引っ張るほど鈍くする（抵抗感）
      const dist = Math.min(MAX_PULL, dy * PULL_FACTOR);
      updatePull(dist);
    };

    const onTouchEnd = () => {
      if (startYRef.current === null) return;
      if (activeRef.current && pullRef.current >= THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        updatePull(THRESHOLD);
        // スピナーを一瞬見せてからリロード
        window.setTimeout(() => window.location.reload(), 350);
      } else {
        updatePull(0);
      }
      startYRef.current = null;
      activeRef.current = false;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled]);

  if (!enabled) return null;

  const progress = Math.min(1, pull / THRESHOLD);
  const offset = (refreshing ? THRESHOLD : pull) - BASE_OFFSET;
  // 指で引いている最中はアニメーションなし（追従）、離したら戻りをアニメーション
  const dragging = pull > 0 && !refreshing;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      style={{
        transform: `translateY(${offset}px)`,
        transition: dragging ? "none" : "transform 0.25s ease",
      }}
    >
      <div className="mt-[env(safe-area-inset-top)] flex h-9 w-9 items-center justify-center rounded-full border bg-background shadow-md">
        <RefreshCw
          className={`h-5 w-5 text-primary ${refreshing ? "animate-spin" : ""}`}
          style={
            refreshing
              ? undefined
              : {
                  transform: `rotate(${progress * 270}deg)`,
                  opacity: 0.35 + progress * 0.65,
                }
          }
        />
      </div>
    </div>
  );
}
