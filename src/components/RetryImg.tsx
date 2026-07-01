"use client";

import { useEffect, useRef, useState } from "react";

const MAX_RETRIES = 2;

type Status = "loading" | "loaded" | "failed";

/**
 * アバター／アイコン等の小さい画像向けの <img> ラッパー（バレ img・ラッパー div なし）。
 *
 * iOS Safari はダウンロード／デコード中に一過性で失敗（onError）し、ブラウザ標準の
 * 壊れた画像「？」を出してしまうことがある。ヘッダー・下部ナビ・メニューに常駐する
 * アバターは全ページで露出するため症状が目立つ。失敗時にキャッシュバスターを付けて
 * 最大 MAX_RETRIES 回まで自動再取得し、それでも失敗したら「？」ではなく灰色の
 * プレースホルダ（呼び出し側の className の形＝rounded 等を踏襲）を残す。
 *
 * 原本をそのまま見せる大きい画像は placeholder 付きの {@link RetryImage} を使う。
 * こちらはサイズ・rounded・配置を呼び出し側が className で与える前提の軽量版。
 */
export function RetryImg({
  src,
  alt,
  className = "",
  loading = "lazy",
}: {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
}) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>("loading");
  const ref = useRef<HTMLImageElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // src が変わったら状態をリセット（リスト再利用での取り違え防止）
  useEffect(() => {
    setAttempt(0);
    setStatus("loading");
  }, [src]);

  // キャッシュ済み等で onLoad が来ないケースを拾う＋アンマウント時のタイマー掃除
  useEffect(() => {
    if (ref.current?.complete && ref.current.naturalWidth > 0) setStatus("loaded");
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // 全リトライ失敗時は壊れた「？」を出さず、同じ形の灰色プレースホルダを残す
  if (status === "failed") {
    return <span className={`${className} bg-muted`} aria-hidden />;
  }

  // 1回目は原本URL、リトライ時はキャッシュバスターを付けて新規取得させる
  const resolvedSrc =
    attempt === 0 ? src : `${src}${src.includes("?") ? "&" : "?"}r=${attempt}`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={resolvedSrc}
      alt={alt}
      loading={loading}
      decoding="async"
      onLoad={() => setStatus("loaded")}
      onError={() => {
        if (attempt < MAX_RETRIES) {
          if (timer.current) clearTimeout(timer.current);
          const next = attempt + 1;
          timer.current = setTimeout(() => setAttempt(next), 300 * next);
        } else {
          setStatus("failed");
        }
      }}
      className={className}
    />
  );
}
