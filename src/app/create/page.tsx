"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { TextInput } from "@/components/TextInput";
import { ImageUpload } from "@/components/ImageUpload";
import { OptionsAccordion } from "@/components/OptionsAccordion";
import { ActionButtons, Visibility } from "@/components/ActionButtons";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import {
  GenerateFormState,
  DEFAULT_POSITION,
  DEFAULT_FONT,
  DEFAULT_COLOR,
  DEFAULT_SIZE,
  DEFAULT_OUTPUT,
  DEFAULT_ARRANGEMENT,
  OUTPUT_CONFIG,
  OutputFormat,
  Position,
  FontFamily,
  Color,
  Size,
  Arrangement,
} from "@/types";
import { parseApiError, formatErrorMessage, type ParsedApiError } from "@/lib/errors";

// 出力形式の表示名
const OUTPUT_LABELS: Record<OutputFormat, string> = {
  mastodon: "AVIF",
  misskey: "AVIF",
  none: "JPEG",
};

interface ResultInfo {
  fileSize: number;
  format: string;
  width: number;
  height: number;
}

interface UserSession {
  id: string;
  username: string;
  displayName: string | null;
  instance: {
    domain: string;
    type: string;
  };
  preferences?: {
    position: Position | null;
    font: FontFamily | null;
    color: Color | null;
    size: Size | null;
    output: OutputFormat | null;
    arrangement: Arrangement | null;
  };
}

const initialState: GenerateFormState = {
  text: "",
  position: DEFAULT_POSITION,
  font: DEFAULT_FONT,
  color: DEFAULT_COLOR,
  size: DEFAULT_SIZE,
  output: DEFAULT_OUTPUT,
  arrangement: DEFAULT_ARRANGEMENT,
  imageFile: null,
  imagePreview: null,
};

export default function CreatePage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<UserSession | null>(null);
  const [formState, setFormState] = useState<GenerateFormState>(initialState);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultMimeType, setResultMimeType] = useState<string>("image/jpeg");
  const [resultInfo, setResultInfo] = useState<ResultInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [loadingTime, setLoadingTime] = useState(0);
  const [error, setError] = useState<ParsedApiError | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [lastGeneratedState, setLastGeneratedState] =
    useState<GenerateFormState | null>(null);
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 認証チェックとユーザー設定の読み込み
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/v1/me");
        if (response.ok) {
          const data = await response.json();
          setIsAuthenticated(true);
          setUser(data);

          // ユーザー設定を初期値に適用
          if (data.preferences) {
            setFormState((prev) => ({
              ...prev,
              position: data.preferences.position || DEFAULT_POSITION,
              font: data.preferences.font || DEFAULT_FONT,
              color: data.preferences.color || DEFAULT_COLOR,
              size: data.preferences.size || DEFAULT_SIZE,
              output: data.preferences.output || DEFAULT_OUTPUT,
              arrangement: data.preferences.arrangement || DEFAULT_ARRANGEMENT,
            }));
          }
        } else {
          setIsAuthenticated(false);
          router.push("/");
        }
      } catch {
        setIsAuthenticated(false);
        router.push("/");
      }
    };
    checkAuth();
  }, [router]);

  // ローディング中の経過時間を更新
  useEffect(() => {
    if (!isLoading) {
      setLoadingTime(0);
      return;
    }

    const interval = setInterval(() => {
      setLoadingTime((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isLoading]);

  // BlobURLのクリーンアップ
  useEffect(() => {
    return () => {
      if (resultUrl) {
        URL.revokeObjectURL(resultUrl);
      }
    };
  }, [resultUrl]);

  const handleImageSelect = useCallback((file: File, preview: string) => {
    setFormState((prev) => ({
      ...prev,
      imageFile: file,
      imagePreview: preview,
    }));
    // 新しい画像がアップロードされたら生成結果をクリア
    setHasGenerated(false);
    setResultUrl(null);
    setError(null);
  }, []);

  const handleReset = useCallback(() => {
    setFormState(initialState);
    setHasGenerated(false);
    setLastGeneratedState(null);
    setResultInfo(null);
    setResultBlob(null);
    setResultMimeType("image/jpeg");
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }
    setError(null);
  }, [resultUrl]);

  const handleGenerate = async () => {
    if (!formState.imageFile) {
      setError({ message: "画像を選択してください" });
      return;
    }

    const trimmedText = formState.text.trim();
    if (!trimmedText) {
      setError({ message: "テキストを入力してください" });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("image", formState.imageFile);
      formData.append("text", formState.text);
      formData.append("position", formState.position);
      formData.append("font", formState.font);
      formData.append("color", formState.color);
      formData.append("size", formState.size);
      formData.append("output", formState.output);
      formData.append("arrangement", formState.arrangement);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 23000);

      const response = await fetch("/api/v1/generate", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const parsedError = await parseApiError(response);
        setError(parsedError);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // 以前のBlobURLを破棄
      if (resultUrl) {
        URL.revokeObjectURL(resultUrl);
      }

      // 拡張子とMIMEタイプを設定
      const config = OUTPUT_CONFIG[formState.output];
      const mimeType = config?.format === "avif" ? "image/avif" : "image/jpeg";
      setResultBlob(blob);
      setResultMimeType(mimeType);

      // 画像サイズを取得してから結果情報を保存
      const img = new Image();
      img.src = url;
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
      });

      setResultInfo({
        fileSize: blob.size,
        format: OUTPUT_LABELS[formState.output],
        width: img.naturalWidth,
        height: img.naturalHeight,
      });

      setResultUrl(url);
      setHasGenerated(true);
      setLastGeneratedState({ ...formState });

      // 生成完了後にページ最上部にスクロール
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError({
          message: "リクエストがタイムアウトしました",
          suggestion: "画像サイズを小さくして再試行してください",
        });
      } else {
        setError({ message: "エラーが発生しました" });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePost = async () => {
    if (!resultBlob || !lastGeneratedState) return;

    setIsPosting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("image", resultBlob);
      formData.append("text", lastGeneratedState.text);
      formData.append("position", lastGeneratedState.position);
      formData.append("font", lastGeneratedState.font);
      formData.append("color", lastGeneratedState.color);
      formData.append("size", lastGeneratedState.size);
      formData.append("output", lastGeneratedState.output);
      formData.append("arrangement", lastGeneratedState.arrangement);
      formData.append("mimeType", resultMimeType);
      formData.append("visibility", visibility);

      const response = await fetch("/api/v1/post", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const parsedError = await parseApiError(response);
        setError(parsedError);
        return;
      }

      const data = await response.json();

      // 投稿成功後、詳細ページにリダイレクト
      if (data.imagePageUrl) {
        router.push(data.imagePageUrl.replace(process.env.NEXT_PUBLIC_APP_URL || "", ""));
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError({ message: "投稿に失敗しました" });
    } finally {
      setIsPosting(false);
    }
  };

  // 設定を初期値として保存
  const handleSaveDefaults = async () => {
    setIsSavingDefaults(true);
    setSaveSuccess(false);

    try {
      const response = await fetch("/api/v1/me/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          position: formState.position,
          font: formState.font,
          color: formState.color,
          size: formState.size,
          output: formState.output,
          arrangement: formState.arrangement,
        }),
      });

      if (response.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const data = await response.json();
        setError({ message: data.error?.message || "設定の保存に失敗しました" });
      }
    } catch {
      setError({ message: "設定の保存に失敗しました" });
    } finally {
      setIsSavingDefaults(false);
    }
  };

  const canGenerate = formState.text.trim().length > 0 && formState.imageFile !== null;

  // 生成後に設定が変更されたかどうか
  const hasChangedSinceGeneration = useMemo(() => {
    if (!hasGenerated || !lastGeneratedState) return false;
    return (
      formState.text !== lastGeneratedState.text ||
      formState.position !== lastGeneratedState.position ||
      formState.font !== lastGeneratedState.font ||
      formState.color !== lastGeneratedState.color ||
      formState.size !== lastGeneratedState.size ||
      formState.output !== lastGeneratedState.output ||
      formState.arrangement !== lastGeneratedState.arrangement
    );
  }, [formState, lastGeneratedState, hasGenerated]);

  // ローディング中のボタンテキスト
  const loadingText = useMemo(() => {
    if (!isLoading) return "";
    if (loadingTime === 0) return "生成中...";
    return `生成中... ${loadingTime}秒`;
  }, [isLoading, loadingTime]);

  // 認証チェック中
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader user={user ? { username: user.username } : null} />
      <main className="container mx-auto max-w-md px-4 py-8">
        <div className="space-y-6">
          {/* 画像エリア */}
          <ImageUpload
            imageFile={formState.imageFile}
            imagePreview={formState.imagePreview}
            resultUrl={resultUrl}
            hasGenerated={hasGenerated}
            resultInfo={resultInfo}
            isLoading={isLoading}
            onImageSelect={handleImageSelect}
            onReset={handleReset}
            disabled={isLoading || isPosting}
          />

          {/* エラー表示 */}
          {error && (
            <div className="rounded-lg bg-destructive/10 p-4">
              <p className="text-destructive">
                {formatErrorMessage(error)}
              </p>
              {error.supportInfo && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {error.supportInfo}
                </p>
              )}
            </div>
          )}

          {/* テキスト入力 */}
          <TextInput
            value={formState.text}
            onChange={(text) => setFormState((prev) => ({ ...prev, text }))}
            disabled={isLoading || isPosting}
          />

          {/* アクションボタン（生成・投稿） */}
          <ActionButtons
            instanceDomain={user?.instance.domain}
            instanceType={user?.instance.type}
            canGenerate={canGenerate}
            canPost={hasGenerated && !hasChangedSinceGeneration}
            canRegenerate={hasGenerated && hasChangedSinceGeneration}
            isLoading={isLoading}
            isPosting={isPosting}
            loadingText={loadingText}
            visibility={visibility}
            onVisibilityChange={setVisibility}
            onGenerate={handleGenerate}
            onPost={handlePost}
          />

          {/* オプション設定（アコーディオン） */}
          <OptionsAccordion
            position={formState.position}
            font={formState.font}
            color={formState.color}
            size={formState.size}
            output={formState.output}
            arrangement={formState.arrangement}
            onPositionChange={(position) =>
              setFormState((prev) => ({ ...prev, position }))
            }
            onFontChange={(font) =>
              setFormState((prev) => ({ ...prev, font }))
            }
            onColorChange={(color) =>
              setFormState((prev) => ({ ...prev, color }))
            }
            onSizeChange={(size) =>
              setFormState((prev) => ({ ...prev, size }))
            }
            onOutputChange={(output) =>
              setFormState((prev) => ({ ...prev, output }))
            }
            onArrangementChange={(arrangement) =>
              setFormState((prev) => ({ ...prev, arrangement }))
            }
            disabled={isLoading || isPosting}
            onSaveDefaults={handleSaveDefaults}
            isSavingDefaults={isSavingDefaults}
            saveSuccess={saveSuccess}
            userDefaults={user?.preferences}
          />
        </div>

        {/* フッター */}
        <Footer />
      </main>
    </div>
  );
}
