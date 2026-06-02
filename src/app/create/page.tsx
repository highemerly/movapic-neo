"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, X } from "lucide-react";
import { TextInput } from "@/components/TextInput";
import { ImageUpload } from "@/components/ImageUpload";
import { OptionsPanel } from "@/components/OptionsPanel";
import { VisibilityPicker } from "@/components/VisibilityPicker";
import { SaveDefaultsSection } from "@/components/SaveDefaultsSection";
import { OtherPostMethods } from "@/components/OtherPostMethods";
import { ActionButtons } from "@/components/ActionButtons";
import {
  PostVisibilityNotice,
  PostLocationNotice,
} from "@/components/PostVisibilityNotice";
import { useStickyVisible } from "@/hooks/useStickyVisible";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/Footer";
import { ResultDetails } from "@/components/ResultDetails";
import { TopProgressBar } from "@/components/TopProgressBar";
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
  Visibility,
  MAX_TEXT_LENGTH,
} from "@/types";
import { parseApiError, formatErrorMessage, type ParsedApiError } from "@/lib/errors";
import { extractExif, type ExtractedExif } from "@/lib/exif/parser";
import { Label } from "@/components/ui/label";

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
  processingTime: number;
  originalFileSize: number;
  originalFormat: string;
  originalWidth: number;
  originalHeight: number;
  requestId: string;
}

interface GenerateResult {
  blob: Blob;
  mimeType: string;
  requestId: string;
  processingTime: number;
  originalFileSize: number;
  originalFormat: string;
  originalWidth: number;
  originalHeight: number;
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
    visibility: Visibility | null;
    cameraOption: "none" | "show" | null;
  };
}

// インスタンス種別から出力形式を自動決定
function outputFromInstanceType(instanceType: string | undefined): OutputFormat {
  return instanceType === "misskey" ? "misskey" : "mastodon";
}

function StepHeader({
  num,
  label,
  right,
}: {
  num: number;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {num}
        </span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      {right && (
        <span className="shrink-0 text-xs text-muted-foreground">{right}</span>
      )}
    </div>
  );
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
  const [exif, setExif] = useState<ExtractedExif | null>(null);
  // 撮影情報は「機種名」「撮影場所」を独立して毎回明示的に選択する
  type CameraOption = "none" | "show";
  type LocationOption = "none" | "pref" | "city";
  const [cameraOption, setCameraOption] = useState<CameraOption>("none");
  const [locationOption, setLocationOption] = useState<LocationOption>("none");
  // 位置情報の解析結果（タップで1回だけ /api/v1/geocode を呼びキャッシュ、同じ画像内で再利用）
  const [geocoded, setGeocoded] = useState<{ prefecture: string; city: string } | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  // 認証チェックとユーザー設定の読み込み
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/v1/me");
        if (response.ok) {
          const data = await response.json();
          setIsAuthenticated(true);
          setUser(data);

          // 出力形式は連携インスタンスの種別から自動決定し、UI ではなく formState に直接反映
          const autoOutput = outputFromInstanceType(data.instance?.type);

          // ユーザー設定を初期値に適用（output は preferences より instance.type を優先）
          if (data.preferences) {
            setFormState((prev) => ({
              ...prev,
              position: data.preferences.position || DEFAULT_POSITION,
              font: data.preferences.font || DEFAULT_FONT,
              color: data.preferences.color || DEFAULT_COLOR,
              size: data.preferences.size || DEFAULT_SIZE,
              output: autoOutput,
              arrangement: data.preferences.arrangement || DEFAULT_ARRANGEMENT,
            }));
            if (data.preferences.visibility) {
              setVisibility(data.preferences.visibility);
            }
          } else {
            setFormState((prev) => ({ ...prev, output: autoOutput }));
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

  // エラートーストの自動消滅: 429(レート制限)は再試行可能になる秒数後、それ以外は5秒後
  useEffect(() => {
    if (!error) return;
    const ms = error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : 5000;
    const timer = setTimeout(() => setError(null), ms);
    return () => clearTimeout(timer);
  }, [error]);

  // BlobURLのクリーンアップ
  useEffect(() => {
    return () => {
      if (resultUrl) {
        URL.revokeObjectURL(resultUrl);
      }
    };
  }, [resultUrl]);

  const handleImageSelect = useCallback(async (file: File, preview: string) => {
    setFormState((prev) => ({
      ...prev,
      imageFile: file,
      imagePreview: preview,
    }));
    // 新しい画像がアップロードされたら生成結果をクリア
    setHasGenerated(false);
    setResultUrl(null);
    setError(null);
    // 撮影情報の選択肢と位置情報の解析キャッシュは画像ごとに毎回リセット
    // 撮影場所は毎回ユーザーに選択してもらう（保存対象外）。
    // カメラ機種は EXIF が取れた後にユーザー初期値があれば "show" に復元する。
    setCameraOption("none");
    setLocationOption("none");
    setGeocoded(null);
    setGeocodeError(null);
    setExif(null);
    const extracted = await extractExif(file);
    setExif(extracted);
    if (user?.preferences?.cameraOption === "show" && extracted?.cameraModel) {
      setCameraOption("show");
    }
  }, [user]);

  const handleReset = useCallback(() => {
    // 出力形式はインスタンス種別の自動値を保持
    const autoOutput = outputFromInstanceType(user?.instance?.type);
    setFormState({ ...initialState, output: autoOutput });
    setHasGenerated(false);
    setLastGeneratedState(null);
    setResultInfo(null);
    setResultBlob(null);
    setResultMimeType("image/jpeg");
    setExif(null);
    setCameraOption("none");
    setLocationOption("none");
    setGeocoded(null);
    setGeocodeError(null);
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }
    setError(null);
  }, [resultUrl, user?.instance?.type]);

  // 生成APIを呼び出してblob・MIMEタイプ・元画像情報を返す（UI状態は更新しない）
  const callGenerate = async (): Promise<GenerateResult | null> => {
    const formData = new FormData();
    formData.append("image", formState.imageFile!);
    formData.append("text", formState.text);
    formData.append("position", formState.position);
    formData.append("font", formState.font);
    formData.append("color", formState.color);
    formData.append("size", formState.size);
    formData.append("output", formState.output);
    formData.append("arrangement", formState.arrangement);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 23000);

    try {
      const response = await fetch("/api/v1/generate", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const parsedError = await parseApiError(response);
        setError(parsedError);
        return null;
      }

      const config = OUTPUT_CONFIG[formState.output];
      const mimeType = config?.format === "avif" ? "image/avif" : "image/jpeg";

      return {
        blob: await response.blob(),
        mimeType,
        requestId: response.headers.get("X-Request-Id") || "",
        processingTime: parseInt(response.headers.get("X-Processing-Time") || "0", 10),
        originalFileSize: parseInt(response.headers.get("X-Original-File-Size") || "0", 10),
        originalFormat: response.headers.get("X-Original-Format") || "",
        originalWidth: parseInt(response.headers.get("X-Original-Width") || "0", 10),
        originalHeight: parseInt(response.headers.get("X-Original-Height") || "0", 10),
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        setError({
          message: "リクエストがタイムアウトしました",
          suggestion: "画像サイズを小さくして再試行してください",
        });
      } else {
        setError({ message: "エラーが発生しました" });
      }
      return null;
    }
  };

  // 生成結果をプレビューUIに反映
  const applyPreview = async (result: GenerateResult) => {
    const url = URL.createObjectURL(result.blob);
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
    }
    setResultBlob(result.blob);
    setResultMimeType(result.mimeType);

    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
    });

    setResultInfo({
      fileSize: result.blob.size,
      format: OUTPUT_LABELS[formState.output],
      width: img.naturalWidth,
      height: img.naturalHeight,
      processingTime: result.processingTime,
      originalFileSize: result.originalFileSize,
      originalFormat: result.originalFormat,
      originalWidth: result.originalWidth,
      originalHeight: result.originalHeight,
      requestId: result.requestId,
    });

    setResultUrl(url);
    setHasGenerated(true);
    setLastGeneratedState({ ...formState });
  };

  // プレビューボタン
  const handleGenerate = async () => {
    if (!formState.imageFile) {
      setError({ message: "画像を選択してください" });
      return;
    }
    if (!formState.text.trim()) {
      setError({ message: "テキストを入力してください" });
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await callGenerate();
    if (result) {
      await applyPreview(result);
      // 生成完了後にページ最上部にスクロール
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
    setIsLoading(false);
  };

  // 投稿ボタン: プレビュー済みならその画像を、未プレビュー/変更ありなら生成してから投稿
  const handlePost = async () => {
    if (!formState.imageFile) {
      setError({ message: "画像を選択してください" });
      return;
    }
    if (!formState.text.trim()) {
      setError({ message: "テキストを入力してください" });
      return;
    }

    setIsPosting(true);
    setError(null);

    try {
      let blob: Blob;
      let mimeType: string;
      let stateToPost: GenerateFormState;

      const canUseExisting =
        hasGenerated && !hasChangedSinceGeneration && resultBlob && lastGeneratedState;

      if (canUseExisting) {
        blob = resultBlob;
        mimeType = resultMimeType;
        stateToPost = lastGeneratedState;
      } else {
        const result = await callGenerate();
        if (!result) return;
        blob = result.blob;
        mimeType = result.mimeType;
        stateToPost = { ...formState };
      }

      const formData = new FormData();
      formData.append("image", blob);
      formData.append("text", stateToPost.text);
      formData.append("position", stateToPost.position);
      formData.append("font", stateToPost.font);
      formData.append("color", stateToPost.color);
      formData.append("size", stateToPost.size);
      formData.append("output", stateToPost.output);
      formData.append("arrangement", stateToPost.arrangement);
      formData.append("mimeType", mimeType);
      formData.append("visibility", visibility);

      // EXIFメタデータ: 表示オプションに従って送る内容を決める
      // - none:         何も送らない
      // 撮影情報: カメラ機種と撮影場所を独立に送る
      // - cameraOption:   "none" | "show"
      // - locationOption: "none" | "pref" | "city"
      // 注: 撮影日時はプライバシー保護のため現在は送信しない（DBカラムは将来用に保持）
      formData.append("cameraOption", cameraOption);
      formData.append("locationOption", locationOption);
      if (cameraOption === "show" && exif) {
        if (exif.cameraMake) formData.append("cameraMake", exif.cameraMake);
        if (exif.cameraModel) formData.append("cameraModel", exif.cameraModel);
      }
      if ((locationOption === "pref" || locationOption === "city") &&
          exif?.gpsLatitude != null && exif?.gpsLongitude != null) {
        formData.append("gpsLatitude", String(exif.gpsLatitude));
        formData.append("gpsLongitude", String(exif.gpsLongitude));
      }

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

      // 投稿成功後、詳細ページにリダイレクト（直後の完了メッセージ用に posted=1 を付与）
      if (data.imagePageUrl) {
        const path = data.imagePageUrl.replace(process.env.NEXT_PUBLIC_APP_URL || "", "");
        const sep = path.includes("?") ? "&" : "?";
        router.push(`${path}${sep}posted=1`);
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError({ message: "投稿に失敗しました" });
    } finally {
      setIsPosting(false);
    }
  };

  // 設定を初期値として保存（文字入れオプション・同時投稿先・カメラ機種名表示）
  // 撮影場所はプライバシー保護のため保存しない
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
          arrangement: formState.arrangement,
          visibility,
          cameraOption,
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

  // 撮影場所セグメント変更時のハンドラ。pref/city 選択時に未解析なら /api/v1/geocode を
  // 1回だけ呼び結果をキャッシュする（プレビューのたびには呼ばない）。
  const handleLocationOptionChange = async (next: LocationOption) => {
    setLocationOption(next);
    const needsGeo = next === "pref" || next === "city";
    if (!needsGeo) return;
    if (geocoded || isGeocoding) return;
    if (exif?.gpsLatitude == null || exif?.gpsLongitude == null) return;

    setIsGeocoding(true);
    setGeocodeError(null);
    try {
      const res = await fetch("/api/v1/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: exif.gpsLatitude, lng: exif.gpsLongitude }),
      });
      if (res.ok) {
        const data = (await res.json()) as { prefecture: string; city: string };
        setGeocoded(data);
      } else {
        const data = await res.json().catch(() => ({}));
        setGeocodeError(data?.error || "撮影場所を取得できませんでした");
      }
    } catch {
      setGeocodeError("撮影場所の取得に失敗しました");
    } finally {
      setIsGeocoding(false);
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

  // アクションボタンが画面外に出たら下部固定表示
  const { anchorRef, showSticky } = useStickyVisible<HTMLDivElement>();

  const actionButtonsProps = {
    canGenerate,
    hasPreview: hasGenerated && !hasChangedSinceGeneration,
    isLoading,
    isPosting,
    onGenerate: handleGenerate,
    onPost: handlePost,
    includesLocation: locationOption !== "none",
  };

  // 撮影場所の表示ラベル（注意文用）
  const locationDisplayLabel = useMemo(() => {
    if (locationOption === "none") return null;
    if (!geocoded) return null;
    return locationOption === "city"
      ? `${geocoded.prefecture}${geocoded.city}`
      : geocoded.prefecture;
  }, [locationOption, geocoded]);

  // 認証チェック中
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  const isProcessing = isLoading || isPosting;
  const progressLabel = isPosting
    ? "投稿中..."
    : isLoading
      ? loadingTime > 0
        ? `生成中... ${loadingTime}秒`
        : "生成中..."
      : undefined;

  return (
    <div className="min-h-screen bg-background">
      <TopProgressBar active={isProcessing} label={progressLabel} />
      <SiteHeader user={user ? { username: user.username } : null} />

      {/* エラートースト（画面中央にフローティング・5秒で自動消滅） */}
      {error && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-lg bg-destructive px-4 py-3 text-white shadow-xl">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{formatErrorMessage(error)}</p>
              {error.supportInfo && (
                <p className="mt-1 text-xs text-white/80">{error.supportInfo}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="shrink-0 text-white/70 transition-colors hover:text-white"
              aria-label="エラーを閉じる"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <main
        className={`container mx-auto max-w-md px-4 pt-4 pb-8 ${showSticky ? "pb-28" : ""}`}
      >
        <h1 className="mb-3 text-xl font-bold">新しい写真を投稿する</h1>
        <div className="space-y-6">
          {/* ① 写真を選ぶ */}
          <div className="space-y-2">
            <StepHeader num={1} label="写真を選ぶ" />
            <ImageUpload
              imageFile={formState.imageFile}
              imagePreview={formState.imagePreview}
              resultUrl={resultUrl}
              hasGenerated={hasGenerated}
              resultInfo={resultInfo}
              isLoading={isLoading}
              isPosting={isPosting}
              loadingTime={loadingTime}
              onImageSelect={handleImageSelect}
              onReset={handleReset}
              disabled={isLoading || isPosting}
            />
          </div>

          {/* 注意事項（画像直下に常に表示・公開範囲と撮影場所に応じて動的に変化） */}
          <div className="space-y-2">
            <PostVisibilityNotice
              visibility={visibility}
              instanceDomain={user?.instance.domain}
            />
            {locationDisplayLabel && (
              <PostLocationNotice locationLabel={locationDisplayLabel} />
            )}
          </div>

          {/* ②コメント入力 → ③オプション → ④追加情報 → ⑤同時投稿先 → ⑥投稿（画像選択後に表示） */}
          {formState.imageFile && (
            <>
              <div className="space-y-2">
                <StepHeader
                  num={2}
                  label="合成するコメントを入力"
                  right={`${formState.text.length} / ${MAX_TEXT_LENGTH}`}
                />
                <TextInput
                  value={formState.text}
                  onChange={(text) => setFormState((prev) => ({ ...prev, text }))}
                  disabled={isLoading || isPosting}
                />
              </div>

              {/* ③ コメント合成オプションを変更 */}
              <div className="space-y-4">
                <StepHeader num={3} label="コメント合成オプションを変更" />
                <OptionsPanel
                  position={formState.position}
                  font={formState.font}
                  color={formState.color}
                  size={formState.size}
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
                  onArrangementChange={(arrangement) =>
                    setFormState((prev) => ({ ...prev, arrangement }))
                  }
                  disabled={isLoading || isPosting}
                />
              </div>

              {/* ④ 投稿する情報を追加（EXIF撮影情報）
                  カメラ機種名と撮影場所を独立したセグメントで毎回選ぶ。デザインは
                  OptionsPanel の SegmentControl と揃える。位置情報のセグメントは
                  pref/city を選んだ初回タップ時のみ /geocode を呼んで結果をキャッシュ。 */}
              <div className="space-y-4">
                <StepHeader num={4} label="投稿する情報を追加" />
                {(() => {
                  const cameraText = exif?.cameraModel
                    ? exif.cameraMake && !exif.cameraModel.startsWith(exif.cameraMake)
                      ? `${exif.cameraMake} ${exif.cameraModel}`
                      : exif.cameraModel
                    : null;
                  const hasGps = !!(exif && exif.gpsLatitude != null && exif.gpsLongitude != null);
                  const disabled = isLoading || isPosting;

                  // EXIFが何も無い場合は何も選べない
                  if (!cameraText && !hasGps) {
                    return (
                      <p className="text-xs text-muted-foreground">
                        この画像には付与できる撮影情報（カメラ機種・GPS）がありません。
                      </p>
                    );
                  }

                  const segmentBtn = (
                    selected: boolean,
                    onClick: () => void,
                    label: React.ReactNode,
                    extraDisabled = false,
                  ) => (
                    <button
                      type="button"
                      onClick={onClick}
                      disabled={disabled || extraDisabled}
                      className={`min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                        selected
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      } ${disabled || extraDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {label}
                    </button>
                  );

                  // セグメントボタンのラベル: 機種名は実値、撮影場所は解析後は実値、未解析時はプレースホルダ
                  const cameraShowLabel = cameraText ? `📷 ${cameraText}` : "(機種情報なし)";
                  const prefLabel = geocoded ? `📍 ${geocoded.prefecture}` : "📍 都道府県のみ";
                  const cityLabel = geocoded ? `📍 ${geocoded.prefecture}${geocoded.city}` : "📍 都道府県+市町村";

                  return (
                    <div className="space-y-5">
                      {/* カメラ機種名 */}
                      <div className="space-y-2">
                        <Label>カメラの機種名</Label>
                        <div className="flex rounded-lg border bg-muted p-1 gap-1">
                          {segmentBtn(cameraOption === "none", () => setCameraOption("none"), "表示しない")}
                          {segmentBtn(cameraOption === "show", () => setCameraOption("show"), cameraShowLabel, !cameraText)}
                        </div>
                        {!cameraText && (
                          <p className="text-[11px] text-muted-foreground">この画像にはカメラ機種情報がありません。</p>
                        )}
                      </div>

                      {/* 撮影場所 */}
                      <div className="space-y-2">
                        <Label>撮影場所</Label>
                        <div className="flex rounded-lg border bg-muted p-1 gap-1">
                          {segmentBtn(locationOption === "none", () => handleLocationOptionChange("none"), "表示しない")}
                          {segmentBtn(locationOption === "pref", () => handleLocationOptionChange("pref"), prefLabel, !hasGps)}
                          {segmentBtn(locationOption === "city", () => handleLocationOptionChange("city"), cityLabel, !hasGps)}
                        </div>
                        {!hasGps && (
                          <p className="text-[11px] text-muted-foreground">
                            この画像には位置情報がありません。iPhone から直接アップロードした写真はiOSの仕様で位置情報が含まれないことがあります。
                          </p>
                        )}
                        {hasGps && locationOption !== "none" && !geocoded && (
                          isGeocoding ? (
                            <p className="text-[11px] text-muted-foreground">撮影場所を解析中…</p>
                          ) : geocodeError ? (
                            <p className="text-[11px] text-destructive">{geocodeError}</p>
                          ) : null
                        )}
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        いかなる場合もサーバーには詳細な位置情報（座標）は保存されず、都道府県名または市区町村名のみが保存されます。
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* ⑤ 同時投稿先（連携サーバーへの公開範囲） */}
              <div className="space-y-2">
                <StepHeader
                  num={5}
                  label={`${user?.instance.domain || "連携サーバー"} への同時投稿`}
                />
                <VisibilityPicker
                  value={visibility}
                  onChange={setVisibility}
                  disabled={isLoading || isPosting}
                />
              </div>

              {/* ⑥ 設定保存・投稿 */}
              <div className="space-y-3">
                <StepHeader num={6} label="設定保存・投稿" />
                {/* 現在の設定を初期値として保存（プレビュー/投稿ボタンの上に配置） */}
                <SaveDefaultsSection
                  onSave={handleSaveDefaults}
                  isSaving={isSavingDefaults}
                  saveSuccess={saveSuccess}
                  disabled={isLoading || isPosting}
                  instanceDomain={user?.instance.domain}
                />
                <div ref={anchorRef}>
                  <ActionButtons {...actionButtonsProps} />
                </div>
              </div>
            </>
          )}

          {/* 生成結果の詳細情報 */}
          {hasGenerated && resultInfo && !isLoading && (
            <ResultDetails resultInfo={resultInfo} />
          )}

          {/* 他の投稿方法 */}
          <OtherPostMethods />
        </div>

        {/* フッター */}
        <Footer />
      </main>

      {/* 画面下固定アクションバー（ボタンが画面外のとき表示） */}
      {showSticky && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-4 pt-2 shadow-[0_-2px_8px_rgba(0,0,0,0.08)] backdrop-blur"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
        >
          <div className="container mx-auto max-w-md">
            <ActionButtons {...actionButtonsProps} />
          </div>
        </div>
      )}
    </div>
  );
}
