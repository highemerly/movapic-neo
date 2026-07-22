"use client";

import { useState, useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "@/components/Link";
import { AltTextReveal } from "@/components/AltTextReveal";
import { RetryImage } from "@/components/gallery/RetryImage";

/** 全画面モーダル内の前後ナビ先。href は遷移先の詳細ページ（zoom=1 付き＝モーダルを開いたまま）。 */
interface ModalNav {
  href: string;
  imageUrl: string;
}

/**
 * 画像詳細の本画像。モバイル(<md)では高さが画面を占有しないよう幅上限を掛けて縮めている
 * （max-md:max-w-[var(--img-max-w)]＝高さ上限を幅上限に読み替えたもの）。大きく見たいときは
 * 画像タップで全画面モーダル（ライトボックス）を開き、オーバーレイのタップ／×／Escで閉じる。
 *
 * モーダル内には前後（prev/next）の矢印を置き、押すと前後の画像へ遷移する。遷移先でもモーダルを
 * 開いたままにするため href に zoom=1 を付け、詳細ページ側が initialOpen で復元する（＝フルスクリーンの
 * まま画像を送れる）。矢印の遷移先画像は開いている間に先読みして体感遅延を抑える。
 *
 * ALT バッジ（AltTextReveal）は画像ボタンの兄弟要素として重なるので、バッジのタップはモーダルを
 * 開かない（別要素・最前面で ALT ダイアログを開く）。
 */
export function ExpandableDetailImage({
  src,
  alt,
  altText,
  aspectRatio,
  blurDataUrl,
  maxVh,
  prev,
  next,
  initialOpen = false,
}: {
  src: string;
  alt: string;
  altText?: string | null;
  aspectRatio: number;
  blurDataUrl?: string | null;
  /** 高さ上限（dvh）。幅上限 = maxVh(dvh) × アスペクト比 に読み替える。 */
  maxVh: number;
  prev?: ModalNav | null;
  next?: ModalNav | null;
  /** URL の zoom=1 由来で初期表示からモーダルを開くか（前後遷移の連続表示用）。 */
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);

  // モーダルを閉じるときは URL の zoom=1 も落とす（リロードで再度開かないように）。
  const close = () => {
    setOpen(false);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("zoom")) {
      url.searchParams.delete("zoom");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  };

  // モーダル表示中は背面スクロールを止める＋Escで閉じる。
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 開いている間、前後画像を先読みしておく（遷移直後にキャッシュから即描画されて体感が軽い）。
  useEffect(() => {
    if (!open) return;
    [prev?.imageUrl, next?.imageUrl].forEach((u) => {
      if (u) {
        const img = new window.Image();
        img.src = u;
      }
    });
  }, [open, prev?.imageUrl, next?.imageUrl]);

  return (
    <div
      className="mx-auto max-md:max-w-[var(--img-max-w)]"
      style={
        { "--img-max-w": `calc(${maxVh}dvh * ${aspectRatio})` } as CSSProperties
      }
    >
      <AltTextReveal altText={altText}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="タップで全画面表示"
          className="block w-full rounded-lg overflow-hidden bg-muted p-0 cursor-zoom-in"
        >
          <RetryImage
            src={src}
            alt={alt}
            loading="eager"
            aspectRatio={aspectRatio}
            blurDataUrl={blurDataUrl}
            containerClassName="w-full"
            imgClassName="absolute inset-0 h-full w-full object-contain"
          />
        </button>
      </AltTextReveal>

      {open &&
        createPortal(
          // オーバーレイのどこをタップしても閉じる（画像・背景いずれも）。矢印はタップ透過させない。
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
            onClick={close}
            role="dialog"
            aria-modal="true"
            aria-label="画像の全画面表示"
          >
            {/* 元画像はインラインで読み込み済み＝キャッシュから即描画されるので素の img で十分。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="max-h-full max-w-full object-contain"
            />

            {prev && (
              <Link
                href={prev.href}
                prefetch
                onClick={(e) => e.stopPropagation()}
                aria-label="前の画像"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white transition-colors hover:bg-black/70"
              >
                <ChevronLeft className="h-7 w-7" />
              </Link>
            )}
            {next && (
              <Link
                href={next.href}
                prefetch
                onClick={(e) => e.stopPropagation()}
                aria-label="次の画像"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white transition-colors hover:bg-black/70"
              >
                <ChevronRight className="h-7 w-7" />
              </Link>
            )}

            <button
              type="button"
              onClick={close}
              aria-label="閉じる"
              className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
            >
              <X className="h-6 w-6" />
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
