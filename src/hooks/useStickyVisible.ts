"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useStickyVisible<T extends HTMLElement>() {
  const [isAnchorVisible, setIsAnchorVisible] = useState(true);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // コールバックref: アンカー要素は画像選択後に後からマウントされるため、
  // マウント/アンマウントのたびにObserverを張り直す
  const anchorRef = useCallback((node: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (node) {
      observerRef.current = new IntersectionObserver(
        ([entry]) => setIsAnchorVisible(entry.isIntersecting),
        { threshold: 0 }
      );
      observerRef.current.observe(node);
    } else {
      setIsAnchorVisible(true);
    }
  }, []);

  useEffect(() => {
    return () => observerRef.current?.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const onResize = () => {
      setIsKeyboardOpen(vv.height / window.innerHeight < 0.75);
    };
    onResize();
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  const showSticky = !isAnchorVisible && !isKeyboardOpen;

  return { anchorRef, showSticky };
}
