"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toastSaved, toastSettingsError } from "./settingsToast";
import { Label } from "@/components/ui/label";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
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
  const [isTogglingSave, setIsTogglingSave] = useState(false);

  // 直近で永続化済みの値のスナップショット（初期は props＝DB値）。現在値がこれと一致する間は
  // 自動保存しない。マウント時や React Strict Mode（dev）の二重マウントでは値が変わらないため
  // 発火せず、開いた瞬間に不要な「保存しました」が出るのを防ぐ。
  const lastSavedRef = useRef(
    JSON.stringify({
      position: initial.position ?? DEFAULT_POSITION,
      font: initial.font ?? DEFAULT_FONT,
      color: initial.color ?? DEFAULT_COLOR,
      size: initial.size ?? DEFAULT_SIZE,
      arrangement: initial.arrangement ?? DEFAULT_ARRANGEMENT,
      visibility: initial.visibility ?? "public",
      cameraOption: initial.cameraOption ?? "none",
    })
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 「保存する」がOFFのときは自動保存しない
    if (!saveEnabled) return;

    const snapshot = JSON.stringify({ position, font, color, size, arrangement, visibility, cameraOption });
    // 永続化済みの値と同じなら何もしない（初回マウント・Strict Modeの二重マウントで発火させない）
    if (snapshot === lastSavedRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
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
        lastSavedRef.current = snapshot;
        router.refresh();
        // オプション連続変更時にトーストが積み上がらないよう安定 id で1枚に集約
        toastSaved("settings-defaults");
      } catch (err) {
        toastSettingsError(err instanceof Error ? err.message : "保存に失敗しました");
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
      toastSaved("settings-mentionkeep");
    } catch (err) {
      toastSettingsError(err instanceof Error ? err.message : "保存に失敗しました");
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
        // 保存済みスナップショットを現在値に更新（直後の自動保存 effect を発火させない）
        lastSavedRef.current = JSON.stringify({ position, font, color, size, arrangement, visibility, cameraOption });
      } else {
        // OFF: 全てクリアしてシステム標準に戻す
        const response = await fetch("/api/v1/me/preferences", { method: "DELETE" });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error?.message || "保存解除に失敗しました");
        }
        // 表示値もシステム標準に戻す（再度ONにしたとき素の状態から始められるように）
        setPosition(DEFAULT_POSITION);
        setFont(DEFAULT_FONT);
        setColor(DEFAULT_COLOR);
        setSize(DEFAULT_SIZE);
        setArrangement(DEFAULT_ARRANGEMENT);
        setVisibility("public");
        setCameraOption("none");
        // スナップショットもシステム標準に合わせる（再ON時に不要な自動保存を出さない）
        lastSavedRef.current = JSON.stringify({
          position: DEFAULT_POSITION,
          font: DEFAULT_FONT,
          color: DEFAULT_COLOR,
          size: DEFAULT_SIZE,
          arrangement: DEFAULT_ARRANGEMENT,
          visibility: "public",
          cameraOption: "none",
        });
      }
      setSaveEnabled(next);
      router.refresh();
      toastSaved("settings-defaults");
    } catch (err) {
      toastSettingsError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setIsTogglingSave(false);
    }
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center justify-between gap-4 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
        <div className="flex-1 min-w-0">
          <p className="text-sm">設定を保存する</p>
          <p className="text-xs text-muted-foreground">
            文字の合成オプションなど好みの設定を保存しておき、初期値として読み込みます。投稿時に変更可能です。原則、全ての投稿方法（Web、Bot、メール）が対象となります。
          </p>
        </div>
        <ToggleSwitch
          checked={saveEnabled}
          onChange={handleToggleSave}
          disabled={isTogglingSave}
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
          </p>
          <p className="text-xs text-muted-foreground">
            Botにメンションを送って投稿したとき、写真の投稿が正常に完了しても、元の投稿を自動で削除しません。
          </p>
        </div>
        <ToggleSwitch
          checked={mentionKeep}
          onChange={handleToggleMentionKeep}
          disabled={isMentionKeepSaving}
        />
      </label>
    </div>
  );
}
