"use client";

import { useRef, useState, useCallback } from "react";
import { X, Loader2, ImagePlus, Eye, Camera, Plus } from "lucide-react";
import { MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from "@/types";
import { useIsHydrated } from "@/hooks/useIsHydrated";
import { OrDivider } from "@/components/OrDivider";

interface ImageUploadProps {
  imageFile: File | null;
  imagePreview: string | null;
  resultUrl: string | null;
  hasGenerated: boolean;
  isLoading?: boolean;
  isPosting?: boolean;
  onImageSelect: (file: File, preview: string) => void;
  onReset: () => void;
  disabled?: boolean;
  /** 現在の代替テキスト（ALT）。バッジの「設定済み/未設定」表示に使う。 */
  altText?: string;
  /** ALTバッジ押下時（親がダイアログを開く）。未指定ならバッジ自体を出さない。 */
  onEditAlt?: () => void;
}

// HEICファイルの拡張子チェック（ブラウザがMIMEタイプを認識しない場合がある）
function isHEICFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".heic") || name.endsWith(".heif");
}

export function ImageUpload({
  imageFile,
  imagePreview,
  resultUrl,
  hasGenerated,
  isLoading,
  isPosting,
  onImageSelect,
  onReset,
  disabled,
  altText,
  onEditAlt,
}: ImageUploadProps) {
  const isBusy = isLoading || isPosting;
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Android Chrome のフォトピッカーはカメラ起動ボタンを持たないため、専用の
  // capture="environment" な input をボタンで呼び出して撮影できるようにする。
  // SSR/初回client renderは false（=ボタン非表示）で揃え、mount 後に判定して
  // 更新するので hydration mismatch は発生しない。
  // hydration 後にのみ navigator を参照（SSR/初回 client render は false で揃える）
  const hydrated = useIsHydrated();
  const isAndroid =
    hydrated &&
    typeof navigator !== "undefined" &&
    /Android/i.test(navigator.userAgent);

  const validateFile = (file: File): string | null => {
    // HEICファイルの場合は拡張子で判定（MIMEタイプが空や不正な場合がある）
    const isHEIC = isHEICFile(file);
    const isValidType = ALLOWED_FILE_TYPES.includes(file.type) || isHEIC;

    if (!isValidType) {
      return "JPEG、PNG、WebP、HEIC、AVIF形式のみ対応しています";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "ファイルサイズは20MB以下にしてください";
    }
    return null;
  };

  const handleFile = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);

      // HEICの場合はプレビューなしでサーバー側で変換
      const isHEIC = isHEICFile(file);
      if (isHEIC) {
        onImageSelect(file, "");
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          const preview = e.target?.result as string;
          onImageSelect(file, preview);
        };
        reader.readAsDataURL(file);
      }
    },
    [onImageSelect]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    } else {
      // Androidで1回目のファイル選択時にfilesが遅延ロードされる場合に対応
      setTimeout(() => {
        const delayedFile = e.target.files?.[0];
        if (delayedFile) {
          handleFile(delayedFile);
        }
      }, 100);
    }
  };

  // ドラッグ操作のうち「ファイルを運んでいる」場合のみ反応する。
  // iOS Safari ではリンク等のドラッグで spurious な dragover が飛び、
  // 対応する dragleave が来ずに isDragging が居残ることがあるため。
  const hasFiles = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types || []).includes("Files");

  const handleDragOver = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  // accept属性にHEIC/HEIF/AVIFを追加
  const acceptTypes = [...ALLOWED_FILE_TYPES, ".heic", ".heif", ".avif"].join(",");

  // 表示する画像URL: 生成結果があればそれを、なければプレビューを表示
  const displayUrl = hasGenerated && resultUrl ? resultUrl : imagePreview;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={acceptTypes}
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />
      {/* Android Chrome のフォトピッカーはカメラを起動できないため、撮影専用の
          input を用意してボタン経由で呼び出す。iOS では既存 input のアクション
          シートにカメラが含まれるので不要。 */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />

      {/* 画像がある場合（プレビューまたは生成結果） */}
      {imageFile ? (
        <div className="relative">
          {displayUrl ? (
            <div className="relative overflow-hidden rounded-lg border bg-muted">
              <img
                src={displayUrl}
                alt={hasGenerated ? "生成された画像" : "プレビュー"}
                className={`w-full object-contain transition-opacity ${isBusy ? "opacity-50" : ""}`}
              />
              {/* 処理中オーバーレイ（プレビュー生成 / 投稿中の両方で表示） */}
              {isBusy && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}
              {/* 右下のALTバッジ（Mastodon風・画像詳細ページと位置を統一）。押すと親がALT編集
                  ダイアログを開く。未設定を primary で強調して入力を促し、設定済みは半透明で確定表示。 */}
              {onEditAlt && !isBusy && (
                <button
                  type="button"
                  onClick={onEditAlt}
                  disabled={disabled}
                  className={`absolute bottom-2 right-2 flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold leading-none transition-colors disabled:opacity-50 ${
                    altText && altText.trim()
                      ? "bg-black/50 text-white hover:bg-black/70"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                  aria-label={
                    altText && altText.trim()
                      ? "代替テキスト（ALT）を編集（設定済み）"
                      : "代替テキスト（ALT）を設定"
                  }
                >
                  {!(altText && altText.trim()) && (
                    <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  )}
                  ALT
                </button>
              )}
              {/* 右上の×ボタン */}
              {!isBusy && (
                <button
                  type="button"
                  onClick={onReset}
                  disabled={disabled}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors disabled:opacity-50"
                  aria-label="画像を削除してやり直す"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {/* 画像中央のプレビューマーク（半透明の横帯・クリックは透過して下のボタンを操作可能）。 */}
              {hasGenerated && !isBusy && (
                <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center gap-1.5 bg-black/55 py-1.5 text-white">
                  <Eye className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-medium">プレビュー</span>
                </div>
              )}
            </div>
          ) : (
            <div className="relative flex h-48 items-center justify-center rounded-lg border bg-muted">
              {isBusy ? (
                <div className="flex flex-col items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground">
                  {imageFile.name}
                  <br />
                  （コメントを入力後プレビューを押してください）
                </p>
              )}
              {/* 右上の×ボタン */}
              {!isBusy && (
                <button
                  type="button"
                  onClick={onReset}
                  disabled={disabled}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors disabled:opacity-50"
                  aria-label="画像を削除してやり直す"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        /* 画像がない場合はドロップゾーンを表示。Android のときはカメラボタンを下に
            並べる分、ファーストビューがずれないように高さを少し詰める。 */
        <div
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex ${isAndroid ? "h-30" : "h-64"} cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50"
          } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
        >
          <div className={`flex ${isAndroid ? "h-12 w-12" : "h-14 w-14"} items-center justify-center rounded-full bg-primary/10`}>
            <ImagePlus className={`${isAndroid ? "h-6 w-6" : "h-7 w-7"} text-primary`} />
          </div>
          <p className="text-base font-medium text-foreground">
            写真をアップロード
          </p>
        </div>
      )}
      {!imageFile && isAndroid && (
        <>
          {/* 「または」: 2つの選択肢が並列であることを視覚的に示す */}
          <OrDivider />
          {/* ドロップゾーン（写真をアップロード）と縦幅・見た目を揃える（同じ h-30 の破線ボックス）。 */}
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={disabled}
            className={`flex h-30 w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 text-base font-medium text-foreground transition-colors ${
              disabled
                ? "cursor-not-allowed border-muted-foreground/25 opacity-50"
                : "border-muted-foreground/25 hover:border-primary/50"
            }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Camera className="h-6 w-6 text-primary" />
            </div>
            写真を撮る
          </button>
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
