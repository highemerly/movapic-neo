"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  };
}

type SaveState = "idle" | "saving" | "saved" | "error";

const SAVE_DEBOUNCE_MS = 400;

export function DefaultsEditor({ initial }: DefaultsEditorProps) {
  const router = useRouter();
  const [position, setPosition] = useState<Position>(initial.position ?? DEFAULT_POSITION);
  const [font, setFont] = useState<FontFamily>(initial.font ?? DEFAULT_FONT);
  const [color, setColor] = useState<Color>(initial.color ?? DEFAULT_COLOR);
  const [size, setSize] = useState<Size>(initial.size ?? DEFAULT_SIZE);
  const [arrangement, setArrangement] = useState<Arrangement>(
    initial.arrangement ?? DEFAULT_ARRANGEMENT
  );
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility ?? "public");
  const [cameraOption, setCameraOption] = useState<CameraOption>(initial.cameraOption ?? "none");

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const isFirstRender = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

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
        setSaveState("saved");
        router.refresh();
        if (savedClearRef.current) clearTimeout(savedClearRef.current);
        savedClearRef.current = setTimeout(() => setSaveState("idle"), 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存に失敗しました");
        setSaveState("error");
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [position, font, color, size, arrangement, visibility, cameraOption, router]);

  const handleReset = async () => {
    const confirmed = confirm(
      "デフォルト設定をリセットしますか？\n\nリセットするとシステム標準の設定が使用されます。"
    );
    if (!confirmed) return;

    setIsResetting(true);
    try {
      const response = await fetch("/api/v1/me/preferences", { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "リセットに失敗しました");
      }
      isFirstRender.current = true;
      setPosition(DEFAULT_POSITION);
      setFont(DEFAULT_FONT);
      setColor(DEFAULT_COLOR);
      setSize(DEFAULT_SIZE);
      setArrangement(DEFAULT_ARRANGEMENT);
      setVisibility("public");
      setCameraOption("none");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "リセットに失敗しました");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-5">
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
        <Label>公開範囲</Label>
        <VisibilityPicker value={visibility} onChange={setVisibility} />
      </div>

      <div className="space-y-2">
        <Label>
          カメラ機種
          <span className="ml-2 text-xs text-muted-foreground">※Bot投稿では未対応</span>
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

      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-h-4">
          {saveState === "saving" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>保存中...</span>
            </>
          )}
          {saveState === "saved" && (
            <>
              <Check className="h-3 w-3 text-green-600" />
              <span className="text-green-600">保存しました</span>
            </>
          )}
          {saveState === "error" && error && (
            <span className="text-destructive">{error}</span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          disabled={isResetting}
        >
          {isResetting ? "リセット中..." : "システム標準に戻す"}
        </Button>
      </div>
    </div>
  );
}
