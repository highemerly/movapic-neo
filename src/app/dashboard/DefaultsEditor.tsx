"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { OptionsPanel } from "@/components/OptionsPanel";
import { VisibilityPicker } from "@/components/VisibilityPicker";
import {
  Position,
  FontFamily,
  Color,
  Size,
  Arrangement,
  Visibility,
  DEFAULT_POSITION,
  DEFAULT_FONT,
  DEFAULT_COLOR,
  DEFAULT_SIZE,
  DEFAULT_ARRANGEMENT,
} from "@/types";

type CameraOption = "none" | "show";

interface DefaultsEditorProps {
  initial: {
    position: Position | null;
    font: FontFamily | null;
    color: Color | null;
    size: Size | null;
    arrangement: Arrangement | null;
    visibility: Visibility | null;
    cameraOption: CameraOption | null;
    mentionKeep: boolean;
  };
  instanceDomain: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

const SAVE_DEBOUNCE_MS = 400;

export function DefaultsEditor({ initial, instanceDomain }: DefaultsEditorProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [position, setPosition] = useState<Position>(initial.position ?? DEFAULT_POSITION);
  const [font, setFont] = useState<FontFamily>(initial.font ?? DEFAULT_FONT);
  const [color, setColor] = useState<Color>(initial.color ?? DEFAULT_COLOR);
  const [size, setSize] = useState<Size>(initial.size ?? DEFAULT_SIZE);
  const [arrangement, setArrangement] = useState<Arrangement>(
    initial.arrangement ?? DEFAULT_ARRANGEMENT
  );
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility ?? "public");
  const [cameraOption, setCameraOption] = useState<CameraOption>(initial.cameraOption ?? "none");

  // 「保存する」のON/OFFはDB上の値の有無から導出（新カラム不要）
  const initialSaveEnabled =
    initial.position !== null ||
    initial.font !== null ||
    initial.color !== null ||
    initial.size !== null ||
    initial.arrangement !== null ||
    initial.visibility !== null ||
    initial.cameraOption !== null;
  const [saveEnabled, setSaveEnabled] = useState(initialSaveEnabled);

  const [mentionKeep, setMentionKeep] = useState(initial.mentionKeep);
  const [isMentionKeepSaving, setIsMentionKeepSaving] = useState(false);
  const [mentionKeepSaveState, setMentionKeepSaveState] = useState<SaveState>("idle");
  const [mentionKeepError, setMentionKeepError] = useState<string | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isTogglingSave, setIsTogglingSave] = useState(false);

  const isFirstRender = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentionKeepSavedClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashSaved = () => {
    setSaveState("saved");
    if (savedClearRef.current) clearTimeout(savedClearRef.current);
    savedClearRef.current = setTimeout(() => setSaveState("idle"), 1500);
  };

  const flashMentionKeepSaved = () => {
    setMentionKeepSaveState("saved");
    if (mentionKeepSavedClearRef.current) clearTimeout(mentionKeepSavedClearRef.current);
    mentionKeepSavedClearRef.current = setTimeout(() => setMentionKeepSaveState("idle"), 1500);
  };

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // 「保存する」がOFFのときは自動保存しない
    if (!saveEnabled) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setSaveState("saving");
      setError(null);
      try {
        const response = await fetch("/api/v1/me/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            position,
            font,
            color,
            size,
            arrangement,
            visibility,
            cameraOption,
          }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error?.message || "保存に失敗しました");
        }
        router.refresh();
        flashSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存に失敗しました");
        setSaveState("error");
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [position, font, color, size, arrangement, visibility, cameraOption, saveEnabled, router]);

  const handleToggleMentionKeep = async () => {
    const next = !mentionKeep;
    setMentionKeep(next);
    setIsMentionKeepSaving(true);
    setMentionKeepSaveState("saving");
    setMentionKeepError(null);
    try {
      const response = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mentionKeep: next }),
      });
      if (!response.ok) {
        setMentionKeep(!next);
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "保存に失敗しました");
      }
      router.refresh();
      flashMentionKeepSaved();
    } catch (err) {
      setMentionKeepError(err instanceof Error ? err.message : "保存に失敗しました");
      setMentionKeepSaveState("error");
    } finally {
      setIsMentionKeepSaving(false);
    }
  };

  const handleToggleSave = async () => {
    const next = !saveEnabled;
    // OFFにする際は警告
    if (!next) {
      const confirmed = await confirm({
        title: "「設定を保存する」を無効にする",
        description:
          "保存済みの設定は全て削除され、サービスの初期値に戻ります。\nよろしいですか？",
        confirmText: "OFFにする",
        destructive: true,
      });
      if (!confirmed) return;
    }
    setIsTogglingSave(true);
    setSaveState("saving");
    setError(null);
    // 切替時のデバウンス中の自動保存をキャンセル
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      if (next) {
        // ON: 現在の表示値を保存（最初はシステム標準）
        const response = await fetch("/api/v1/me/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            position,
            font,
            color,
            size,
            arrangement,
            visibility,
            cameraOption,
          }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error?.message || "保存に失敗しました");
        }
      } else {
        // OFF: 全てクリアしてシステム標準に戻す
        const response = await fetch("/api/v1/me/preferences", { method: "DELETE" });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error?.message || "保存解除に失敗しました");
        }
        // 表示値もシステム標準に戻す（再度ONにしたとき素の状態から始められるように）
        isFirstRender.current = true;
        setPosition(DEFAULT_POSITION);
        setFont(DEFAULT_FONT);
        setColor(DEFAULT_COLOR);
        setSize(DEFAULT_SIZE);
        setArrangement(DEFAULT_ARRANGEMENT);
        setVisibility("public");
        setCameraOption("none");
      }
      setSaveEnabled(next);
      router.refresh();
      flashSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setSaveState("error");
    } finally {
      setIsTogglingSave(false);
    }
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center justify-between gap-4 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
        <div className="flex-1 min-w-0">
          <p className="text-sm flex items-center flex-wrap gap-x-2">
            設定を保存する
            {saveState === "saving" && (
              <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                保存中...
              </span>
            )}
            {saveState === "saved" && (
              <span className="flex items-center gap-1 text-xs font-normal text-green-600">
                <Check className="h-3 w-3" />
                保存しました
              </span>
            )}
            {saveState === "error" && error && (
              <span className="text-xs font-normal text-destructive">{error}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            文字の合成オプションなど好みの設定を保存しておき、初期値として読み込みます。投稿時に変更可能です。原則、全ての投稿方法（Web、Bot、メール）が対象となります。
          </p>
        </div>
        <div
          className={`relative flex-shrink-0 w-11 h-6 rounded-full border transition-colors ${
            saveEnabled ? "bg-primary border-primary" : "bg-input border-border"
          } ${isTogglingSave ? "opacity-60" : ""}`}
        >
          <div
            className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              saveEnabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </div>
        <input
          type="checkbox"
          checked={saveEnabled}
          onChange={handleToggleSave}
          disabled={isTogglingSave}
          className="sr-only"
        />
      </label>

      {saveEnabled && (
        <div className="space-y-5 ml-4 pl-4 border-l-2 border-border">
          <OptionsPanel
            position={position}
            font={font}
            color={color}
            size={size}
            arrangement={arrangement}
            onPositionChange={setPosition}
            onFontChange={setFont}
            onColorChange={setColor}
            onSizeChange={setSize}
            onArrangementChange={setArrangement}
          />

          <div className="space-y-2">
            <Label>{instanceDomain} への同時投稿</Label>
            <VisibilityPicker value={visibility} onChange={setVisibility} />
          </div>

          <div className="space-y-2">
            <Label>
              カメラ機種
              <span className="ml-2 text-xs text-muted-foreground">（Web投稿・メール投稿のみ）</span>
            </Label>
            <div className="flex rounded-lg border bg-muted p-1 gap-1">
              {(["none", "show"] as CameraOption[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setCameraOption(opt)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                    cameraOption === opt
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt === "none" ? "表示しない" : "機種名を表示"}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            プライバシー保護のため、位置情報の投稿設定はこの機能の対象外です（位置情報の投稿には毎回オプトインが必要です）。
          </p>

        </div>
      )}

      <label className="flex items-center justify-between gap-4 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
        <div className="flex-1 min-w-0">
          <p className="text-sm flex items-center flex-wrap gap-x-2">
            元投稿を残す
            <span className="text-xs font-normal text-muted-foreground">（Bot投稿のみ）</span>
            {mentionKeepSaveState === "saving" && (
              <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                保存中...
              </span>
            )}
            {mentionKeepSaveState === "saved" && (
              <span className="flex items-center gap-1 text-xs font-normal text-green-600">
                <Check className="h-3 w-3" />
                保存しました
              </span>
            )}
            {mentionKeepSaveState === "error" && mentionKeepError && (
              <span className="text-xs font-normal text-destructive">{mentionKeepError}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Botにメンションを送って投稿したとき、写真の投稿が正常に完了しても、元の投稿を自動で削除しません。
          </p>
        </div>
        <div
          className={`relative flex-shrink-0 w-11 h-6 rounded-full border transition-colors ${
            mentionKeep ? "bg-primary border-primary" : "bg-input border-border"
          } ${isMentionKeepSaving ? "opacity-60" : ""}`}
        >
          <div
            className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              mentionKeep ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </div>
        <input
          type="checkbox"
          checked={mentionKeep}
          onChange={handleToggleMentionKeep}
          disabled={isMentionKeepSaving}
          className="sr-only"
        />
      </label>
    </div>
  );
}
