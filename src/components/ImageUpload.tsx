"use client";

import { useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from "@/types";

interface ResultInfo {
  fileSize: number;
  format: string;
  width: number;
  height: number;
}

// ファイルサイズをフォーマットする関数
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface ImageUploadProps {
  imageFile: File | null;
  imagePreview: string | null;
  resultUrl: string | null;
  hasGenerated: boolean;
  resultInfo: ResultInfo | null;
  instanceDomain?: string;
  isPosting?: boolean;
  onImageSelect: (file: File, preview: string) => void;
  onReset: () => void;
  onDownload: () => void;
  onPost?: () => void;
  disabled?: boolean;
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
  resultInfo,
  instanceDomain,
  isPosting,
  onImageSelect,
  onReset,
  onDownload,
  onPost,
  disabled,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    // HEICファイルの場合は拡張子で判定（MIMEタイプが空や不正な場合がある）
    const isHEIC = isHEICFile(file);
    const isValidType = ALLOWED_FILE_TYPES.includes(file.type) || isHEIC;

    if (!isValidType) {
      return "JPEG、PNG、WebP、HEIC、AVIF形式のみ対応しています";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "ファイルサイズは25MB以下にしてください";
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
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
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
      <Label>画像</Label>
      <input
        ref={inputRef}
        type="file"
        accept={acceptTypes}
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />

      {/* 画像がある場合（プレビューまたは生成結果） */}
      {imageFile ? (
        <div className="space-y-2">
          {displayUrl ? (
            <div className="relative overflow-hidden rounded-lg border">
              <img
                src={displayUrl}
                alt={hasGenerated ? "生成された画像" : "プレビュー"}
                className="w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center rounded-lg border bg-muted">
              <p className="text-sm text-muted-foreground">
                {imageFile.name}（プレビュー不可）
              </p>
            </div>
          )}

          {/* 生成後は投稿ボタンと画像変更ボタンを表示 */}
          {hasGenerated ? (
            <div className="space-y-2">
              {/* 生成結果の情報表示 */}
              {resultInfo && (
                <p className="text-center text-xs text-muted-foreground">
                  {resultInfo.width} × {resultInfo.height} / {resultInfo.format} / {formatFileSize(resultInfo.fileSize)}
                </p>
              )}
              <div className="flex gap-2">
                {instanceDomain && onPost ? (
                  <Button
                    type="button"
                    onClick={onPost}
                    disabled={disabled || isPosting}
                    className="flex-1"
                  >
                    {isPosting ? "投稿中..." : `${instanceDomain} に投稿`}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={onDownload}
                    disabled={disabled}
                    className="flex-1"
                  >
                    ダウンロード
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={onReset}
                  disabled={disabled || isPosting}
                  className="flex-1"
                >
                  最初からやり直す
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={onReset}
              disabled={disabled}
              className="w-full"
            >
              画像を削除
            </Button>
          )}
        </div>
      ) : (
        /* 画像がない場合はドロップゾーンを表示 */
        <div
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50"
          } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
        >
          <p className="text-sm text-muted-foreground">
            クリックまたはドラッグ&ドロップで画像を選択
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            JPEG, PNG, WebP, HEIC, AVIF（最大25MB）
          </p>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
