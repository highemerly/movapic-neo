"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Loader2,
  Share2,
  ExternalLink,
  ImageDown,
  Download,
  Sun,
  Moon,
} from "lucide-react";
import { toast } from "sonner";
import { parseApiError, formatErrorMessage } from "@/lib/errors";
import { MastodonIcon } from "@/components/icons/MastodonIcon";
import { MisskeyIcon } from "@/components/icons/MisskeyIcon";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Visibility = "public" | "unlisted" | "followers";
type Destination = "server" | "device";
type CollageTheme = "light" | "dark";

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: "public", label: "公開" },
  { value: "unlisted", label: "非収載" },
  { value: "followers", label: "フォロワー限定" },
];

const THEME_OPTIONS: { value: CollageTheme; label: React.ReactNode }[] = [
  { value: "light", label: <><Sun className="h-4 w-4" />ライト</> },
  { value: "dark", label: <><Moon className="h-4 w-4" />ダーク</> },
];

/** OptionsPanel（文字合成オプション）と同じ見た目のセグメント選択。 */
function SegmentControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1 rounded-lg border bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          disabled={disabled}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
            value === o.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * カレンダー画像（コラージュ）の共有ダイアログ（ベータ）。
 * プレビュー枠をタップして画像を生成 → 投稿先（自分のサーバー / 他のサーバー / 端末）を選ぶ。
 * 生成済み Blob を保持し、サーバー投稿・OS共有へ回す（他のサーバーは anypost.dev/share を開く）。
 */
export function CollageShareDialog({
  year,
  month,
  serverName,
  instanceType,
  onClose,
}: {
  year: number;
  month: number;
  /** 投稿先サーバー名（ボタン文言「○○へ投稿する」に使う）。 */
  serverName: string;
  /** ログイン中インスタンスの種別（"mastodon" | "misskey"）。投稿ボタンのロゴ出し分けに使う。 */
  instanceType: string;
  onClose: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [theme, setTheme] = useState<CollageTheme>("light");
  const [destination, setDestination] = useState<Destination>("server");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [posting, setPosting] = useState(false);
  const [postedUrl, setPostedUrl] = useState<string | null>(null);
  // この端末が画像ファイルの共有に対応しているか（未対応なら「端末で共有」を出さない）。
  const [canShareFiles, setCanShareFiles] = useState(false);
  // 投稿・共有へ回すため生成済み Blob を保持。
  const blobRef = useRef<Blob | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Web Share（ファイル）対応判定。
    // navigator.share があれば基本的に出す。canShare が実装されている環境では
    // ファイル共有可否を尊重するが、iOS Safari など canShare が無い/厳しい環境で
    // 誤って非表示にしないよう「share があれば true」を基本にする。
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        let ok = true;
        if (typeof navigator.canShare === "function") {
          const probe = new File([new Blob(["0"])], "probe.jpg", { type: "image/jpeg" });
          ok = navigator.canShare({ files: [probe] });
        }
        if (ok) {
          // 端末機能の一度きりの判定（外部環境の同期）。cascading render の誤検知のため無効化。
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setCanShareFiles(true);
        }
      }
    } catch {
      /* 非対応環境は無視 */
    }
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/v1/calendar/collage/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, theme }),
      });
      if (!res.ok) {
        toast.error(formatErrorMessage(await parseApiError(res)));
        return;
      }
      const blob = await res.blob();
      blobRef.current = blob;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setBlobUrl(url);
    } catch {
      toast.error("画像の生成に失敗しました");
    } finally {
      setGenerating(false);
    }
  }, [year, month, theme, generating]);

  // テーマ変更時は生成済みプレビューを破棄して再生成を促す（テーマは生成時に焼き込むため）。
  const handleThemeChange = useCallback((next: CollageTheme) => {
    setTheme(next);
    setBlobUrl((prev) => {
      if (prev) {
        blobRef.current = null;
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
      }
      return null;
    });
  }, []);

  const handlePostServer = useCallback(async () => {
    if (!blobRef.current || posting) return;
    setPosting(true);
    try {
      const form = new FormData();
      form.append("image", blobRef.current, "calendar.jpg");
      form.append("year", String(year));
      form.append("month", String(month));
      form.append("visibility", visibility);
      const res = await fetch("/api/v1/calendar/collage/post", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        toast.error(formatErrorMessage(await parseApiError(res)));
        return;
      }
      const d = await res.json().catch(() => ({}));
      if (!d.success) {
        toast.error("投稿に失敗しました");
        return;
      }
      toast.success("投稿しました");
      setPostedUrl(d.postUrl ?? null);
    } catch {
      toast.error("投稿に失敗しました");
    } finally {
      setPosting(false);
    }
  }, [year, month, visibility, posting]);

  const handleShareDevice = useCallback(async () => {
    if (!blobRef.current) return;
    const file = new File(
      [blobRef.current],
      `shamezo-calendar-${year}-${String(month).padStart(2, "0")}.jpg`,
      { type: "image/jpeg" },
    );
    try {
      if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
        toast.error("この端末では共有できません");
        return;
      }
      // canShare がある環境だけファイル共有可否を確認する（無い環境はそのまま share を試す）。
      if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) {
        toast.error("この端末では画像を共有できません");
        return;
      }
      await navigator.share({ files: [file], title: `${year}年${month}月のカレンダー` });
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("共有に失敗しました");
    }
  }, [year, month]);

  const destinationOptions: { value: Destination; label: React.ReactNode }[] = [
    {
      value: "server",
      label: (
        <>
          {instanceType === "misskey" ? (
            <MisskeyIcon className="h-4 w-4 text-[#86b300]" />
          ) : (
            <MastodonIcon className="h-4 w-4 text-[#6364ff]" />
          )}
          投稿する
        </>
      ),
    },
    ...(canShareFiles
      ? [{ value: "device" as Destination, label: <><Download className="h-4 w-4" />画像を書き出す</> }]
      : []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-background p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-bold">
            <Share2 className="h-4 w-4" />
            カレンダー画像をシェア
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
              ベータ
            </span>
          </h3>
          <button
            onClick={onClose}
            className="-m-1.5 rounded p-2.5 text-muted-foreground hover:bg-muted"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 配色テーマ（生成前に選択・変更するとプレビューを破棄して再生成を促す） */}
        {postedUrl === null && (
          <div className="mb-3 space-y-2">
            <Label>配色</Label>
            <SegmentControl
              value={theme}
              options={THEME_OPTIONS}
              onChange={handleThemeChange}
              disabled={generating || posting}
            />
          </div>
        )}

        {/* プレビュー枠（生成前は枠自体が「画像を生成」ボタン） */}
        {blobUrl ? (
          <div className="mb-3 overflow-hidden rounded-lg border bg-muted/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={blobUrl} alt={`${year}年${month}月のカレンダー`} className="h-auto w-full" />
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="mb-3 flex min-h-[200px] w-full items-center justify-center rounded-lg border border-dashed bg-muted/30 px-6 text-center transition-colors hover:bg-muted/50 disabled:opacity-70"
          >
            {generating ? (
              <span className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-xs">画像を生成中…</span>
              </span>
            ) : (
              <span className="flex flex-col items-center gap-1.5 text-muted-foreground">
                <ImageDown className="h-6 w-6" />
                <span className="text-sm font-medium text-foreground">
                  {year}年{month}月のカレンダーを1枚の画像にします
                </span>
                <span className="text-xs">タップして画像を生成</span>
              </span>
            )}
          </button>
        )}

        {postedUrl !== null ? (
          <div className="space-y-3">
            <p className="text-center text-sm text-muted-foreground">投稿しました。</p>
            {postedUrl && (
              <a
                href={postedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-md border py-2 text-sm hover:bg-muted"
              >
                <ExternalLink className="h-4 w-4" />
                投稿を開く
              </a>
            )}
            <Button variant="outline" className="w-full" onClick={onClose}>
              閉じる
            </Button>
          </div>
        ) : blobUrl ? (
          <div className="space-y-4">
            {/* 投稿先 */}
            <div className="space-y-2">
              <Label>シェア方法</Label>
              <SegmentControl
                value={destination}
                options={destinationOptions}
                onChange={setDestination}
                disabled={posting}
              />
            </div>

            {destination === "server" ? (
              <>
                {/* 公開範囲（自分のサーバー投稿時のみ） */}
                <div className="space-y-2">
                  <Label>公開範囲</Label>
                  <SegmentControl
                    value={visibility}
                    options={VISIBILITY_OPTIONS}
                    onChange={setVisibility}
                    disabled={posting}
                  />
                </div>

                <Button
                  className="w-full gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90"
                  onClick={handlePostServer}
                  disabled={posting}
                >
                  {posting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      投稿中…
                    </>
                  ) : (
                    <>
                      <Share2 className="h-4 w-4" />
                      {serverName}へ投稿する
                    </>
                  )}
                </Button>
              </>
            ) : (
              <Button className="w-full gap-1.5" onClick={handleShareDevice}>
                <Share2 className="h-4 w-4" />
                共有・保存する
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
