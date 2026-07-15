"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { TextInput } from "@/components/TextInput";
import { ImageUpload } from "@/components/ImageUpload";
import { OptionsPanel } from "@/components/OptionsPanel";
import { VisibilityPicker } from "@/components/VisibilityPicker";
import { SegmentControl } from "@/components/SegmentControl";
import { SeasonToggle } from "./SeasonToggle";
import { AltTextDialog } from "@/components/AltTextDialog";
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
import {
  parseApiError,
  formatErrorMessage,
  type ParsedApiError,
} from "@/lib/errors";
import { extractExif, type ExtractedExif } from "@/lib/exif/parser";
import { userPathSegment } from "@/lib/userHandle";
import {
  uploadWithProgress,
  UploadError,
  type UploadErrorPhase,
} from "@/lib/uploadWithProgress";
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

// サーバーシェル（page.tsx）から渡される認証済みユーザー情報とフォーム初期値。
// 旧来の client 側 fetch("/api/v1/me") を廃止し、サーバーで getCurrentUserWithPreferences
// から取得して props で渡す。
export interface CreateClientProps {
  user: {
    username: string;
    instance: {
      domain: string;
      type: string;
    };
    /** プロキシ済みアバターURL（サーバー側で getAvatarUrl 済み）。ヘッダーのアイコン用 */
    avatarUrl?: string | null;
  };
  preferences: {
    position: Position | null;
    font: FontFamily | null;
    color: Color | null;
    size: Size | null;
    arrangement: Arrangement | null;
    visibility: Visibility | null;
    cameraOption: "none" | "show" | null;
  };
  /** 現在アクティブなシーズン（期間限定）。null=シーズン中でない（トグル非表示） */
  activeSeason: {
    key: string;
    label: string;
    description: string;
    /** 期間の表示ラベル（例 "7/1〜7/10"） */
    period: string;
  } | null;
  /** ?season=<key> が今アクティブなシーズンと一致したとき true＝最初から選択状態にする */
  defaultSeasonOn?: boolean;
  /** まだ1枚も投稿していないユーザー＝初回投稿者向けにUIを簡素化する（③以降を折りたたむ等） */
  firstTime?: boolean;
  /** 初回ログイン直後（?welcome=1）＝歓迎バナーを表示する */
  showWelcome?: boolean;
  /** 「他の投稿方法」モーダル用の設定（Bot宛先・メール宛先）。env/ユーザー由来でサーバー側から渡す */
  postMethods: {
    botAcct: string;
    emailPrefix: string;
    emailDomain: string;
  };
}

// インスタンス種別から出力形式を自動決定
function outputFromInstanceType(
  instanceType: string | undefined,
): OutputFormat {
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
  season: null,
  imageFile: null,
  imagePreview: null,
};

// アップロード/処理フェーズ別のエラー文言。「画像を小さく」等の的外れな案内を避ける。
const UPLOAD_ERROR_MESSAGES: Record<
  UploadErrorPhase,
  { message: string; suggestion?: string }
> = {
  "upload-stall": {
    message: "アップロードが完了できませんでした",
    suggestion: "通信環境の良い場所で、もう一度お試しください",
  },
  "process-timeout": {
    message: "画像の処理がタイムアウトしました",
    suggestion: "しばらく待ってから、もう一度お試しください",
  },
  network: {
    message: "通信エラーが発生しました",
    suggestion: "電波状況をご確認のうえ、もう一度お試しください",
  },
  aborted: {
    message: "キャンセルしました",
  },
};

export function CreateClient({ user, preferences, activeSeason, defaultSeasonOn, firstTime = false, showWelcome = false, postMethods }: CreateClientProps) {
  const router = useRouter();
  // 初回投稿者は③以降（色・位置などの詳細オプション）を折りたたんで最初は隠す。
  // 既定はデフォルト値で投稿できるので、写真→コメント→投稿の最短動線を邪魔しない。
  // 2回目以降のユーザーは従来どおり最初から開いておく。
  const [optionsOpen, setOptionsOpen] = useState(!firstTime);
  // 出力形式は連携インスタンスの種別から自動決定
  const autoOutput = outputFromInstanceType(user.instance.type);
  // フォーム初期値はユーザー設定（preferences）で seed（output は instance.type を優先）。
  // 遅延初期化なので useEffect 不要・初回描画でフラッシュなし。
  const [formState, setFormState] = useState<GenerateFormState>(() => ({
    ...initialState,
    position: preferences.position ?? DEFAULT_POSITION,
    font: preferences.font ?? DEFAULT_FONT,
    color: preferences.color ?? DEFAULT_COLOR,
    size: preferences.size ?? DEFAULT_SIZE,
    output: autoOutput,
    arrangement: preferences.arrangement ?? DEFAULT_ARRANGEMENT,
    // ?season=<key> での告知リンク経由なら、最初から期間限定アレンジを選択状態にする。
    season: defaultSeasonOn && activeSeason ? activeSeason.key : null,
  }));
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultMimeType, setResultMimeType] = useState<string>("image/jpeg");
  const [resultInfo, setResultInfo] = useState<ResultInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [loadingTime, setLoadingTime] = useState(0);
  // 通信フェーズ: null=非通信 / "uploading"=送信中(進捗%あり) / "processing"=サーバー処理中(不定)
  const [uploadPhase, setUploadPhase] = useState<
    null | "uploading" | "processing"
  >(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [lastGeneratedState, setLastGeneratedState] =
    useState<GenerateFormState | null>(null);
  const [visibility, setVisibility] = useState<Visibility>(
    preferences.visibility ?? "public",
  );
  // 画像の代替テキスト（ALT）。生成には不要なので formState には載せず独立に持つ。
  // 投稿時（handlePost）の FormData にだけ相乗りさせる。画像を変えたら破棄する。
  const [altText, setAltText] = useState("");
  const [altDialogOpen, setAltDialogOpen] = useState(false);
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [exif, setExif] = useState<ExtractedExif | null>(null);
  // 撮影情報は「機種名」「撮影場所」を独立して毎回明示的に選択する
  type CameraOption = "none" | "show";
  type LocationOption = "none" | "pref" | "city";
  const [cameraOption, setCameraOption] = useState<CameraOption>("none");
  const [locationOption, setLocationOption] = useState<LocationOption>("none");
  // 位置情報の解析結果（タップで1回だけ /api/v1/geocode を呼びキャッシュ、同じ画像内で再利用）
  const [geocoded, setGeocoded] = useState<{
    prefecture: string;
    city: string;
  } | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  // GPSの無い画像のとき、過去に投稿実績のある場所だけ手動で選べるようにする。
  // 一覧は画像選択時（GPS無しの場合のみ）に /api/v1/me/locations から1回だけ取得してキャッシュ。
  const [pastLocations, setPastLocations] = useState<{
    prefectures: string[];
    cities: { prefecture: string; city: string }[];
  } | null>(null);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  // 手動選択中の場所（pref モード＝都道府県名 / city モード＝都道府県+市町村の組）
  const [manualPref, setManualPref] = useState<string>("");
  const [manualCity, setManualCity] = useState<{
    prefecture: string;
    city: string;
  } | null>(null);

  // サーバー処理フェーズ中のみ経過秒数を更新（生成・投稿共通）。
  // リセットはフェーズ遷移時のハンドラ側で行い、effect 内での同期 setState を避ける。
  useEffect(() => {
    if (uploadPhase !== "processing") return;
    const interval = setInterval(() => {
      setLoadingTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [uploadPhase]);

  // エラーは sonner トーストで表示（成功トーストと統一）。
  // 表示時間: 通常8秒。429(レート制限)は再試行可能秒数+1秒（3〜10秒にクランプ）。
  // supportInfo（Error code: ...）は description として2行目に出す。
  const showError = useCallback((e: ParsedApiError) => {
    let ms = 8000;
    if (e.retryAfterSeconds) {
      const seconds = Math.min(10, Math.max(3, e.retryAfterSeconds + 1));
      ms = seconds * 1000;
    }
    toast.error(formatErrorMessage(e), {
      description: e.supportInfo,
      duration: ms,
    });
  }, []);

  // BlobURLのクリーンアップ
  useEffect(() => {
    return () => {
      if (resultUrl) {
        URL.revokeObjectURL(resultUrl);
      }
    };
  }, [resultUrl]);

  // 画像アップロード後はプレビュー/投稿アクションが出るので、下部ナビ（BottomNav）を隠すための
  // 目印を <html> に立てる（画像未選択のうちはナビを表示しておく）。CSS の create-has-image
  // バリアントが拾う。離脱時・画像未選択時は属性を外す。
  useEffect(() => {
    const el = document.documentElement;
    if (formState.imageFile) {
      el.setAttribute("data-create-has-image", "");
    } else {
      el.removeAttribute("data-create-has-image");
    }
    return () => {
      el.removeAttribute("data-create-has-image");
    };
  }, [formState.imageFile]);

  const handleImageSelect = useCallback(
    async (file: File, preview: string) => {
      setFormState((prev) => ({
        ...prev,
        imageFile: file,
        imagePreview: preview,
      }));
      // 新しい画像がアップロードされたら生成結果をクリア
      setHasGenerated(false);
      setResultUrl(null);
      // ALTは「その写真」の説明なので、別の写真になったら破棄する
      setAltText("");
      toast.dismiss();
      // 撮影情報の選択肢と位置情報の解析キャッシュは画像ごとに毎回リセット
      // 撮影場所は毎回ユーザーに選択してもらう（保存対象外）。
      // カメラ機種は EXIF が取れた後にユーザー初期値があれば "show" に復元する。
      setCameraOption("none");
      setLocationOption("none");
      setGeocoded(null);
      setGeocodeError(null);
      setExif(null);
      setManualPref("");
      setManualCity(null);
      setPastLocations(null);
      const extracted = await extractExif(file);
      setExif(extracted);
      if (preferences.cameraOption === "show" && extracted?.cameraModel) {
        setCameraOption("show");
      }
      // GPSの無い画像だけ、手動選択用に過去の投稿地を1回取得する。
      // GPSがある画像は従来どおり座標から逆引きするので取得不要。
      const hasGps =
        extracted?.gpsLatitude != null && extracted?.gpsLongitude != null;
      if (!hasGps) {
        setIsLoadingLocations(true);
        try {
          const res = await fetch("/api/v1/me/locations");
          if (res.ok) {
            setPastLocations(
              (await res.json()) as {
                prefectures: string[];
                cities: { prefecture: string; city: string }[];
              },
            );
          }
        } catch {
          // 取得失敗時は手動選択を出さない（従来どおり disabled のまま）
        } finally {
          setIsLoadingLocations(false);
        }
      }
    },
    [preferences.cameraOption],
  );

  // PWA の Web Share Target 経由で共有された画像を受け取る。
  // Service Worker が画像を Cache Storage("shared-image"/"/__shared") に置き、
  // /create?shared=1 へ誘導してくるので、ここで取り出して通常のアップロードと
  // 同じ handleImageSelect に流す（EXIF抽出等もそのまま再利用）。
  const sharedConsumedRef = useRef(false);
  useEffect(() => {
    if (sharedConsumedRef.current) return;
    if (typeof window === "undefined" || !("caches" in window)) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("shared") !== "1") return;
    sharedConsumedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const cache = await caches.open("shared-image");
        const res = await cache.match("/__shared");
        if (res && !cancelled) {
          const blob = await res.blob();
          const type = blob.type || "image/jpeg";
          const ext = type.split("/")[1] || "jpg";
          const file = new File([blob], `shared.${ext}`, { type });
          const preview = URL.createObjectURL(file);
          await handleImageSelect(file, preview);
        }
        await cache.delete("/__shared");
      } catch (e) {
        console.error("共有画像の読み込みに失敗しました:", e);
      } finally {
        // リロードで再処理されないよう URL から ?shared=1 を消す
        router.replace("/create");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handleImageSelect, router]);

  const handleReset = useCallback(() => {
    // 出力形式はインスタンス種別の自動値を保持
    const resetOutput = outputFromInstanceType(user.instance.type);
    setFormState({ ...initialState, output: resetOutput });
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
    setAltText("");
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }
    toast.dismiss();
  }, [resultUrl, user.instance.type]);

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
    if (formState.season) formData.append("season", formState.season);

    // アップロード中は stall(20s) でのみ中断＝遅い回線でも進捗が進む限り待つ。
    // アップロード完了後の合成処理だけを processTimeout で計測（サーバー generate 22s + マージン）。
    setUploadPhase("uploading");
    setUploadPct(0);
    try {
      const response = await uploadWithProgress("/api/v1/generate", formData, {
        onProgress: (loaded, total) =>
          setUploadPct(total > 0 ? Math.round((loaded / total) * 100) : 0),
        onUploadComplete: () => {
          setLoadingTime(0);
          setUploadPhase("processing");
        },
        stallMs: 20000,
        processTimeoutMs: 25000,
      });

      if (!response.ok) {
        const parsedError = await parseApiError(response);
        showError(parsedError);
        return null;
      }

      const config = OUTPUT_CONFIG[formState.output];
      const mimeType = config?.format === "avif" ? "image/avif" : "image/jpeg";

      return {
        blob: await response.blob(),
        mimeType,
        requestId: response.headers.get("X-Request-Id") || "",
        processingTime: parseInt(
          response.headers.get("X-Processing-Time") || "0",
          10,
        ),
        originalFileSize: parseInt(
          response.headers.get("X-Original-File-Size") || "0",
          10,
        ),
        originalFormat: response.headers.get("X-Original-Format") || "",
        originalWidth: parseInt(
          response.headers.get("X-Original-Width") || "0",
          10,
        ),
        originalHeight: parseInt(
          response.headers.get("X-Original-Height") || "0",
          10,
        ),
      };
    } catch (err) {
      if (err instanceof UploadError) {
        showError(UPLOAD_ERROR_MESSAGES[err.phase]);
      } else {
        showError({ message: "エラーが発生しました" });
      }
      return null;
    } finally {
      setUploadPhase(null);
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
      showError({ message: "画像を選択してください" });
      return;
    }
    if (!formState.text.trim()) {
      showError({ message: "テキストを入力してください" });
      return;
    }

    setLoadingTime(0);
    setIsLoading(true);
    toast.dismiss();

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
      showError({ message: "画像を選択してください" });
      return;
    }
    if (!formState.text.trim()) {
      showError({ message: "テキストを入力してください" });
      return;
    }

    setIsPosting(true);
    toast.dismiss();

    try {
      let blob: Blob;
      let mimeType: string;
      let stateToPost: GenerateFormState;

      const canUseExisting =
        hasGenerated &&
        !hasChangedSinceGeneration &&
        resultBlob &&
        lastGeneratedState;

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
      if (stateToPost.season) formData.append("season", stateToPost.season);
      formData.append("mimeType", mimeType);
      formData.append("visibility", visibility);
      // 代替テキスト（ALT）: 設定されている場合のみ送る（generate には送らない）
      if (altText.trim()) formData.append("altText", altText.trim());

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
      if (locationOption === "pref" || locationOption === "city") {
        const hasGps =
          exif?.gpsLatitude != null && exif?.gpsLongitude != null;
        if (hasGps) {
          // GPSあり: 座標を送り、サーバー側で逆引きして確定（従来どおり）
          formData.append("gpsLatitude", String(exif!.gpsLatitude));
          formData.append("gpsLongitude", String(exif!.gpsLongitude));
        } else if (locationOption === "city" && manualCity) {
          // GPSなし: 手動選択した都道府県+市町村（サーバー側で過去投稿と照合）
          formData.append("locationPrefecture", manualCity.prefecture);
          formData.append("locationCity", manualCity.city);
        } else if (locationOption === "pref" && manualPref) {
          formData.append("locationPrefecture", manualPref);
        }
      }

      // 投稿は生成済み画像を再アップロード＝通信負荷が大きい。generate 同様にフェーズ表示。
      // 処理側は R2→DB→Fediverse を直列実行し正当に長時間かかり得る（かつ中断は部分保存の危険が
      // あるため不可）ので processTimeout は設けず、stall(20s) のみで送信の詰まりを検知する。
      setUploadPhase("uploading");
      setUploadPct(0);
      const response = await uploadWithProgress("/api/v1/post", formData, {
        onProgress: (loaded, total) =>
          setUploadPct(total > 0 ? Math.round((loaded / total) * 100) : 0),
        onUploadComplete: () => {
          setLoadingTime(0);
          setUploadPhase("processing");
        },
        stallMs: 20000,
      });

      if (!response.ok) {
        const parsedError = await parseApiError(response);
        showError(parsedError);
        return;
      }

      const data = await response.json();

      // この投稿で新規獲得した実績があれば、遷移先の画像ページで演出するため一時保存
      if (
        Array.isArray(data.newAchievements) &&
        data.newAchievements.length > 0
      ) {
        try {
          sessionStorage.setItem(
            "movapic_new_achievements",
            JSON.stringify(data.newAchievements),
          );
        } catch {
          // sessionStorage 不可でも投稿フローは継続
        }
      }

      // 投稿後、詳細ページにリダイレクト（直後の完了メッセージ用に posted=1 を付与）。
      // SHAMEZOへの保存は成功しているので、Fediverse投稿だけ失敗した場合も遷移する
      // （＝保存物を見せて重複投稿を防ぐ）。連合投稿の失敗は federr=1 で警告表示させる。
      if (data.imagePageUrl) {
        const path = data.imagePageUrl.replace(
          process.env.NEXT_PUBLIC_APP_URL || "",
          "",
        );
        const sep = path.includes("?") ? "&" : "?";
        // 連合投稿が失敗したときは federr=1（＋サーバー応答があれば fedstatus=コード）を付与
        const federr = data.fediverseError
          ? `&federr=1${data.fediverseErrorStatus ? `&fedstatus=${data.fediverseErrorStatus}` : ""}`
          : "";
        router.push(`${path}${sep}posted=1${federr}`);
      } else {
        // imagePageUrl が返らなかった稀なケースのフォールバック。投稿は保存済みなので、
        // 自分のユーザーページへ送って保存物を確認できるようにする。
        router.push(`/u/${userPathSegment(user.username, user.instance.domain)}`);
      }
    } catch (err) {
      if (err instanceof UploadError) {
        showError(UPLOAD_ERROR_MESSAGES[err.phase]);
      } else {
        showError({ message: "投稿に失敗しました" });
      }
    } finally {
      setUploadPhase(null);
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
        showError({
          message: data.error?.message || "設定の保存に失敗しました",
        });
      }
    } catch {
      showError({ message: "設定の保存に失敗しました" });
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

  const canGenerate =
    formState.text.trim().length > 0 && formState.imageFile !== null;

  // 生成後に設定が変更されたかどうか（安価な比較のため useMemo は不要）
  const hasChangedSinceGeneration =
    hasGenerated && lastGeneratedState
      ? formState.text !== lastGeneratedState.text ||
        formState.position !== lastGeneratedState.position ||
        formState.font !== lastGeneratedState.font ||
        formState.color !== lastGeneratedState.color ||
        formState.size !== lastGeneratedState.size ||
        formState.output !== lastGeneratedState.output ||
        formState.arrangement !== lastGeneratedState.arrangement ||
        formState.season !== lastGeneratedState.season
      : false;

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

  // 撮影場所の表示ラベル（注意文用）。GPSありは逆引き結果、GPSなしは手動選択値を使う。
  const locationDisplayLabel = useMemo(() => {
    if (locationOption === "none") return null;
    if (geocoded) {
      return locationOption === "city"
        ? `${geocoded.prefecture}${geocoded.city}`
        : geocoded.prefecture;
    }
    // 手動選択（GPSなし）
    if (locationOption === "city" && manualCity) {
      return `${manualCity.prefecture}${manualCity.city}`;
    }
    if (locationOption === "pref" && manualPref) {
      return manualPref;
    }
    return null;
  }, [locationOption, geocoded, manualPref, manualCity]);

  const isProcessing = isLoading || isPosting;
  // 文言は2種類だけに統一（生成/投稿でも区別しない）。処理中は0秒から常に秒数を出す。
  const progressLabel = (() => {
    if (uploadPhase === "uploading") return `アップロード中 ${uploadPct}%`;
    if (isProcessing) return `処理中 ${loadingTime}秒...`;
    return undefined;
  })();

  return (
    <div className="min-h-screen bg-background">
      <TopProgressBar
        active={isProcessing}
        label={progressLabel}
        progress={uploadPhase === "uploading" ? uploadPct : undefined}
      />
      <SiteHeader
        user={{ username: user.username, instanceDomain: user.instance.domain, avatarUrl: user.avatarUrl }}
      />


      <main
        className={`container mx-auto px-4 pt-4 pb-8 transition-[max-width] duration-500 ease-out ${
          formState.imageFile ? "max-w-md lg:max-w-6xl" : "max-w-md"
        } ${showSticky ? "pb-28" : ""}`}
      >
        <h1 className="mb-3 text-xl font-bold">新しい写真を投稿する</h1>

        {/* 初回ログイン直後の歓迎バナー（?welcome=1）。写真＋コメントだけで投稿できることを伝える。 */}
        {showWelcome && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 animate-in fade-in slide-in-from-top-1 duration-500">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="text-sm font-bold">ようこそ SHAMEZO へ！</p>
              <p className="text-xs text-muted-foreground">
                写真を選んで、入れたいひとことを書くだけ。あとはそのまま「投稿」でOKです。色や位置にこだわりたいときは、投稿する前に自由に選べます。
              </p>
            </div>
          </div>
        )}
        {/* 写真アップロード後（横幅の広い端末）は2段組:
            左列 = ① 写真 + 注意事項（lg で sticky・常に表示） / 右列 = ②〜⑤ + ⑥設定保存。
            スマホ幅と未アップロード時は従来どおり1列。投稿ボタンは段組の外（従来位置）に置く。 */}
        <div
          className={`grid gap-6 ${
            formState.imageFile
              ? "lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-8 lg:items-start"
              : ""
          }`}
        >
          {/* 左列: ① 写真を選ぶ + 注意事項 */}
          <div
            className={
              formState.imageFile
                ? "space-y-6 lg:sticky lg:top-4 lg:self-start"
                : "space-y-6"
            }
          >
            {/* 写真を選ぶ（番号なし・アップロードが起点。番号付きガイドは①コメントから始まる） */}
            <div className="space-y-2">
              <ImageUpload
                imageFile={formState.imageFile}
                imagePreview={formState.imagePreview}
                resultUrl={resultUrl}
                hasGenerated={hasGenerated}
                isLoading={isLoading}
                isPosting={isPosting}
                onImageSelect={handleImageSelect}
                onReset={handleReset}
                disabled={isLoading || isPosting}
                altText={altText}
                onEditAlt={() => setAltDialogOpen(true)}
              />

              {/* 他の投稿方法（Fediverse／メール）。写真アップロードの代替手段として、
                  カメラ撮影ボタンと同じ「または」区切り＋破線ボタンでアップロード直下に並べる。
                  写真を選ぶと非表示。初回投稿者にはまず1枚目に集中してもらうため出さない。 */}
              {!firstTime && !formState.imageFile && (
                <OtherPostMethods
                  botAcct={postMethods.botAcct}
                  emailPrefix={postMethods.emailPrefix}
                  emailDomain={postMethods.emailDomain}
                  instanceDomain={user.instance.domain}
                  instanceType={user.instance.type}
                />
              )}
            </div>

            {/* 注意事項（画像直下に常に表示・公開範囲と撮影場所に応じて動的に変化） */}
            <div className="space-y-2">
              <PostVisibilityNotice
                visibility={visibility}
                instanceDomain={user.instance.domain}
              />
              {locationDisplayLabel && (
                <PostLocationNotice locationLabel={locationDisplayLabel} />
              )}
            </div>
          </div>

          {/* 右列: ①コメント入力 → ②オプション → ③追加情報 → ④同時投稿先 → ⑤設定保存
              （投稿ボタンは段組の外・従来位置に配置）。アップロード時に にゅーっと出現。 */}
          {formState.imageFile && (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-500 ease-out">
              <div className="space-y-2">
                <StepHeader
                  num={1}
                  label="合成するコメントを入力"
                  right={`${formState.text.length} / ${MAX_TEXT_LENGTH}`}
                />
                <TextInput
                  value={formState.text}
                  onChange={(text) =>
                    setFormState((prev) => ({ ...prev, text }))
                  }
                  disabled={isLoading || isPosting}
                />
              </div>

              {/* 初回投稿者向け: ②以降は最初は隠し、このボタンを押すと展開する。
                  一度開いたら閉じ操作は不要（＝再度折りたためない）ので、開いたらボタン自体を消す。 */}
              {firstTime && !optionsOpen && (
                <button
                  type="button"
                  onClick={() => setOptionsOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border bg-muted/50 px-4 py-3 text-center transition-colors hover:bg-muted"
                >
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">文字の色や位置を変える</span>
                </button>
              )}

              {/* ②〜⑤: 初回投稿者は上のボタンを押して展開したときだけ表示。2回目以降は常に表示し、
                  コメント未入力のうちは「非アクティブ風」（淡色＋操作不可）で見せる。 */}
              {(!firstTime || optionsOpen) && (
              <div
                className={`space-y-6 transition-opacity duration-300 ${
                  !firstTime && formState.text.trim().length === 0
                    ? "pointer-events-none select-none opacity-40"
                    : ""
                }`}
                aria-disabled={!firstTime && formState.text.trim().length === 0}
              >
                {/* ② コメント合成オプションを変更 */}
                <div className="space-y-4">
                  <StepHeader num={2} label="コメント合成オプションを変更" />

                  {/* シーズン（期間限定）: アクティブなシーズン中のみ最上位に表示。
                      「使う」にすると他のオプションはすべて消え、プリセットで自動生成される。 */}
                  {activeSeason && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-sm font-bold text-amber-500">
                        <Sparkles className="h-4 w-4" />
                        <span>【おすすめ】期間限定アレンジ</span>
                      </div>
                      {/* シーズントグル（不等幅＋色可変サムの専用実装）。 */}
                      <SeasonToggle
                        seasonLabel={activeSeason.label}
                        seasonPeriod={activeSeason.period}
                        seasonOn={formState.season !== null}
                        disabled={isLoading || isPosting}
                        onChange={(on) =>
                          setFormState((prev) => ({
                            ...prev,
                            season: on ? activeSeason.key : null,
                          }))
                        }
                      />
                      {formState.season && (
                        <p className="text-xs text-muted-foreground">
                          位置・色・サイズ・フォント・アレンジは自動で設定されます。
                        </p>
                      )}
                    </div>
                  )}

                  {/* シーズン使用中は通常のコメント合成オプションを非表示にする */}
                  {!formState.season && (
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
                  )}
                </div>

                {/* ④ 投稿する情報を追加（EXIF撮影情報）
                  カメラ機種名と撮影場所を独立したセグメントで毎回選ぶ。共通の
                  SegmentControl（ラベルが長いので size="xs"＋truncate）を使う。位置情報の
                  セグメントは pref/city を選んだ初回タップ時のみ /geocode を呼んで結果をキャッシュ。 */}
                <div className="space-y-4">
                  <StepHeader num={3} label="付与する情報を追加" />
                  {(() => {
                    const cameraText = exif?.cameraModel
                      ? exif.cameraMake &&
                        !exif.cameraModel.startsWith(exif.cameraMake)
                        ? `${exif.cameraMake} ${exif.cameraModel}`
                        : exif.cameraModel
                      : null;
                    const hasGps = !!(
                      exif &&
                      exif.gpsLatitude != null &&
                      exif.gpsLongitude != null
                    );
                    const disabled = isLoading || isPosting;

                    // GPSが無い画像でも、過去に投稿実績のある場所なら手動で選べる
                    const prefAvailable =
                      hasGps ||
                      !!(pastLocations && pastLocations.prefectures.length > 0);
                    const cityAvailable =
                      hasGps ||
                      !!(pastLocations && pastLocations.cities.length > 0);
                    const hasManualLocations = !hasGps && (prefAvailable || cityAvailable);

                    // カメラ機種もGPSも手動候補も無く、読み込み中でもない＝何も選べない
                    if (
                      !cameraText &&
                      !hasGps &&
                      !hasManualLocations &&
                      !isLoadingLocations
                    ) {
                      return (
                        <p className="text-xs text-muted-foreground">
                          この画像には付与できる撮影情報（カメラ機種・GPS）がありません。
                        </p>
                      );
                    }

                    // セグメントボタンのラベル: 機種名は実値、撮影場所は解析後は実値、未解析時はプレースホルダ
                    const cameraShowLabel = cameraText
                      ? `📷 ${cameraText}`
                      : "(機種情報なし)";
                    const prefLabel = geocoded
                      ? `📍 ${geocoded.prefecture}`
                      : "📍 都道府県のみ";
                    const cityLabel = geocoded
                      ? `📍 ${geocoded.prefecture}${geocoded.city}`
                      : "📍 都道府県+市町村";

                    const cameraOptions: CameraOption[] = ["none", "show"];
                    const locationOptions: LocationOption[] = [
                      "none",
                      "pref",
                      "city",
                    ];

                    return (
                      <div className="space-y-5">
                        {/* カメラ機種名（機種情報がある画像のときだけ表示。
                            後付けはしない仕様なので、無い場合はセクションごと出さない） */}
                        {cameraText && (
                          <div className="space-y-2">
                            <Label>カメラの機種名</Label>
                            <SegmentControl
                              value={cameraOption}
                              options={cameraOptions}
                              onChange={setCameraOption}
                              disabled={disabled}
                              size="xs"
                              truncate
                              renderOption={(opt) =>
                                opt === "none" ? "表示しない" : cameraShowLabel
                              }
                            />
                          </div>
                        )}

                        {/* 撮影場所 */}
                        <div className="space-y-2">
                          <Label>撮影場所</Label>
                          <SegmentControl
                            value={locationOption}
                            options={locationOptions}
                            onChange={handleLocationOptionChange}
                            disabled={disabled}
                            size="xs"
                            truncate
                            optionDisabled={(opt) =>
                              (opt === "pref" && !prefAvailable) ||
                              (opt === "city" && !cityAvailable)
                            }
                            renderOption={(opt) =>
                              opt === "none"
                                ? "表示しない"
                                : opt === "pref"
                                  ? prefLabel
                                  : cityLabel
                            }
                          />

                          {/* GPSなし: 状況に応じた案内 */}
                          {!hasGps &&
                            (isLoadingLocations ? (
                              <p className="text-xs text-muted-foreground">
                                過去に投稿した場所を読み込み中…
                              </p>
                            ) : hasManualLocations ? (
                              <p className="text-xs text-muted-foreground">
                                この画像には位置情報がありません。過去に投稿したことのある場所から手動で選べます。
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                この画像には位置情報がありません。
                              </p>
                            ))}

                          {/* GPSなし・都道府県のみ: 過去の都道府県から選択 */}
                          {!hasGps &&
                            locationOption === "pref" &&
                            pastLocations &&
                            pastLocations.prefectures.length > 0 && (
                              <div className="relative">
                                <select
                                  value={manualPref}
                                  onChange={(e) => setManualPref(e.target.value)}
                                  disabled={disabled}
                                  className="w-full appearance-none rounded-lg border bg-muted px-3 py-2 pr-9 text-xs font-medium text-foreground transition-colors hover:bg-muted/70 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <option value="">都道府県を選択…</option>
                                  {pastLocations.prefectures.map((p) => (
                                    <option key={p} value={p}>
                                      {p}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              </div>
                            )}

                          {/* GPSなし・都道府県+市町村: 過去の組み合わせから選択 */}
                          {!hasGps &&
                            locationOption === "city" &&
                            pastLocations &&
                            pastLocations.cities.length > 0 && (
                              <div className="relative">
                                <select
                                  value={
                                    manualCity
                                      ? `${manualCity.prefecture}\u0000${manualCity.city}`
                                      : ""
                                  }
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (!v) {
                                      setManualCity(null);
                                      return;
                                    }
                                    const [prefecture, city] = v.split("\u0000");
                                    setManualCity({ prefecture, city });
                                  }}
                                  disabled={disabled}
                                  className="w-full appearance-none rounded-lg border bg-muted px-3 py-2 pr-9 text-xs font-medium text-foreground transition-colors hover:bg-muted/70 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <option value="">市町村を選択…</option>
                                  {pastLocations.cities.map((c) => (
                                    <option
                                      key={`${c.prefecture}\u0000${c.city}`}
                                      value={`${c.prefecture}\u0000${c.city}`}
                                    >
                                      {c.prefecture}
                                      {c.city}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              </div>
                            )}

                          {hasGps &&
                            locationOption !== "none" &&
                            !geocoded &&
                            (isGeocoding ? (
                              <p className="text-xs text-muted-foreground">
                                撮影場所を解析中…
                              </p>
                            ) : geocodeError ? (
                              <p className="text-xs text-destructive">
                                {geocodeError}
                              </p>
                            ) : null)}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* ④ 同時投稿先(連携サーバーへの公開範囲) */}
                <div className="space-y-2">
                  <StepHeader
                    num={4}
                    label={`${user.instance.domain || "連携サーバー"} への同時投稿`}
                  />
                  <VisibilityPicker
                    value={visibility}
                    onChange={setVisibility}
                    disabled={isLoading || isPosting}
                  />
                </div>

                {/* ⑤ 設定保存（投稿ボタンは段組の外・従来位置に配置） */}
                <div className="space-y-3">
                  <StepHeader num={5} label="設定保存・投稿" />
                  {/* 現在の設定を初期値として保存（プレビュー/投稿ボタンの上に配置）。
                      期間限定アレンジ使用中はスタイルがプリセット固定のため保存対象がなく、非表示にする。 */}
                  {!formState.season && (
                    <SaveDefaultsSection
                      onSave={handleSaveDefaults}
                      isSaving={isSavingDefaults}
                      saveSuccess={saveSuccess}
                      disabled={isLoading || isPosting}
                    />
                  )}
                </div>
              </div>
              )}
            </div>
          )}
        </div>

        {/* 投稿ボタン（段組の外。PC では2列合計の幅いっぱいに配置） */}
        {formState.imageFile && (
          <div ref={anchorRef} className="mt-6">
            <ActionButtons {...actionButtonsProps} />
          </div>
        )}

        {/* 生成結果の詳細情報（PC では2列合計の幅いっぱいに配置） */}
        {hasGenerated && resultInfo && !isLoading && (
          <div className="mt-6">
            <ResultDetails resultInfo={resultInfo} />
          </div>
        )}

        {/* フッター */}
        <Footer />
      </main>

      {/* 画面下固定アクションバー（ボタンが画面外のとき表示） */}
      {showSticky && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-4 pt-2 shadow-[0_-2px_8px_rgba(0,0,0,0.08)] backdrop-blur"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)",
          }}
        >
          <div className="container mx-auto max-w-md">
            <ActionButtons {...actionButtonsProps} />
          </div>
        </div>
      )}

      {/* 代替テキスト（ALT）編集ダイアログ。ImageUpload のALTバッジから開く。
          参考画像は生成結果があればそれ、なければアップロードプレビューを出す。 */}
      <AltTextDialog
        open={altDialogOpen}
        value={altText}
        previewUrl={
          hasGenerated && resultUrl ? resultUrl : formState.imagePreview
        }
        onSave={setAltText}
        onClose={() => setAltDialogOpen(false)}
      />
    </div>
  );
}
