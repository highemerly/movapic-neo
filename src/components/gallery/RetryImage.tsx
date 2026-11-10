"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const MAX_RETRIES = 2;

type Status = "loading" | "retrying" | "loaded" | "failed";

const subscribeNothing = () => () => {};

/**
 * サーバー描画（SSR とそのハイドレーション）中は false、クライアントで新しくマウントしたときは true。
 */
function useIsClientMount(): boolean {
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);
  // ハイドレーション後の再レンダーで true に変わっても、最初の値のまま扱う
  const [initial] = useState(isClient);
  return initial;
}

/**
 * フルサイズ画像（縮小せず原本を表示する箇所）向けの共通 <img> ラッパー。
 *
 * iOS Safari は重い画像のダウンロード／デコード中に一過性で失敗（onError）し、
 * そのままブラウザ標準の壊れた画像「？」を表示してしまうことがある。発生そのものは
 * アプリ側で防げないため、失敗時に同一URLのまま <img> を再マウント（key=attempt）して
 * 最大 MAX_RETRIES 回まで自動再取得し、それでも失敗したら「？」ではなくプレースホルダ
 * （灰色）を維持する。
 *
 * リトライにキャッシュバスター（?r=）は付けない。失敗の主因は URL の腐りではなく
 * iOS 側の一過性の資源不足なので、同一URLで張り直せば十分再取得でき、かつ CDN/プロキシ
 * のキャッシュを活かせる（バスターは毎回キャッシュミス＝オリジン往復で逆に遅く、
 * クエリ検証つきプロキシでは 403/404 を招く）。
 *
 * SSR で出た <img> は最初から見せる（読み込み後のフェードインはクライアントで追加された分だけ）。
 * pitfall: 以前は SSR の <img> も opacity-0 で出し、onLoad で表示していた。React はハイドレーション前に
 * 起きた load/error を捨てるため、画像が先に届いてもハイドレーションまで見えず LCP がその分遅れ
 * （計測で約0.6秒）、ハイドレーション前に失敗した画像はリトライされず灰色のまま止まっていた。
 *
 * 縮小表示で十分な箇所（サムネイル等）はそもそもデコードが軽く問題が出ないので、
 * このコンポーネントは原本をそのまま見せる箇所（タイムライン写真・画像詳細の本画像）専用。
 */
export function RetryImage({
  src,
  alt,
  imgClassName = "",
  containerClassName = "",
  loading = "lazy",
  showPlaceholder = true,
  blurDataUrl,
  aspectRatio,
}: {
  src: string;
  alt: string;
  /** <img> に付与するクラス（object-cover / 位置クロップ等は呼び出し側で指定） */
  imgClassName?: string;
  /** ラッパー <div> に付与するクラス（aspect / サイズ等） */
  containerClassName?: string;
  loading?: "lazy" | "eager";
  /** 読み込み中・失敗時にパルス／灰色のプレースホルダを内部で出すか */
  showPlaceholder?: boolean;
  /**
   * Blurプレースホルダ用 LQIP（data:image/webp;base64,...）。あれば読み込み中に灰色ではなく
   * 原本を縮小したぼかしプレビューを描く（追加の画像リクエストは発生しない）。無ければ従来の灰色。
   */
  blurDataUrl?: string | null;
  /**
   * width/height から算出したアスペクト比（= width / height）。指定するとコンテナが
   * 読み込み前からその比率で高さを確保する（レイアウトシフト防止＋blur/img を絶対配置で敷ける）。
   * 指定時は呼び出し側で img を `absolute inset-0 h-full w-full` 等にすること。
   */
  aspectRatio?: number;
}) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>("loading");
  const ref = useRef<HTMLImageElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeIn = useIsClientMount();

  // src（原本URL）が変わったら状態をリセット（リスト再利用での取り違え防止）。
  // レンダー中に前回 src と比較して同期する（effect 内 setState を避ける React 推奨パターン）。
  const [prevSrc, setPrevSrc] = useState(src);
  if (prevSrc !== src) {
    setPrevSrc(src);
    setAttempt(0);
    setStatus("loading");
  }

  const handleError = () => {
    if (attempt < MAX_RETRIES) {
      setStatus("retrying");
      if (timer.current) clearTimeout(timer.current);
      const next = attempt + 1;
      timer.current = setTimeout(() => {
        setAttempt(next);
        setStatus("loading");
      }, 300 * next);
    } else {
      setStatus("failed");
    }
  };

  // ハイドレーション前（とキャッシュ済み）で onLoad/onError が来なかった分を拾う＋アンマウント時のタイマー掃除
  useEffect(() => {
    const img = ref.current;
    if (img?.complete) {
      if (img.naturalWidth > 0) setStatus("loaded");
      else handleError();
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // マウント時に一度だけ見る（以降は onLoad/onError が届く）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loaded = status === "loaded";
  // リトライ中・失敗後は iOS の壊れた画像「？」を見せない。SSR 分の初回読み込みは届きしだい見せる。
  const visible = loaded || (!fadeIn && attempt === 0 && status === "loading");

  return (
    <div
      className={`relative ${containerClassName}`}
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      {showPlaceholder && !loaded && (
        blurDataUrl ? (
          // LQIP（原本を32pxに縮小したWebP）のぼかしプレビュー。object-cover で枠を埋め、
          // 拡大＋CSSぼかしで低解像度のドットを馴染ませる（scale はぼかしの透明な縁を隠す）。
          <>
            <div
              className="absolute inset-0 bg-cover bg-center scale-110"
              style={{ backgroundImage: `url(${blurDataUrl})`, filter: "blur(12px)" }}
              aria-hidden
            />
            {/* 読み込み中であることを示す光沢走査。blur の filter を継がないよう別レイヤーに置き、
                走査帯を枠内でクリップする（帯自体は枠外から差し込む）。 */}
            <div
              className="pointer-events-none absolute inset-0 overflow-hidden"
              aria-hidden
            >
              <div className="animate-shimmer absolute inset-y-0 -left-full w-full bg-gradient-to-r from-transparent via-white/3 to-transparent" />
            </div>
          </>
        ) : (
          <div
            className={`absolute inset-0 bg-muted ${status === "failed" ? "" : "animate-pulse"}`}
            aria-hidden
          />
        )
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={attempt}
        ref={ref}
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => setStatus("loaded")}
        onError={handleError}
        className={`${fadeIn ? "transition-opacity duration-300" : ""} ${
          visible ? "opacity-100" : "opacity-0"
        } ${imgClassName}`}
      />
    </div>
  );
}
