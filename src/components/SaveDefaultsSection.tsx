"use client";

import { useState } from "react";
import { Bookmark, Check, ChevronDown } from "lucide-react";

interface SaveDefaultsSectionProps {
  onSave: () => void;
  isSaving: boolean;
  saveSuccess: boolean;
  disabled?: boolean;
  instanceDomain?: string;
}

export function SaveDefaultsSection({
  onSave,
  isSaving,
  saveSuccess,
  disabled,
  instanceDomain,
}: SaveDefaultsSectionProps) {
  const [open, setOpen] = useState(false);
  const domain = instanceDomain || "連携サーバー";

  return (
    <div className="text-sm space-y-1.5">
      <button
        type="button"
        onClick={onSave}
        disabled={disabled || isSaving}
        className={`inline-flex items-center gap-1.5 underline-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          saveSuccess
            ? "text-green-600 dark:text-green-400"
            : "text-foreground hover:underline"
        }`}
      >
        {saveSuccess ? (
          <Check className="h-4 w-4" />
        ) : (
          <Bookmark className="h-4 w-4" />
        )}
        <span>
          {isSaving
            ? "保存中..."
            : saveSuccess
              ? "保存しました"
              : "現在の設定を初期値として保存"}
        </span>
      </button>
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={open}
        >
          <ChevronDown
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          />
          保存される項目を確認
        </button>
      </div>
      {open && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-2">
          <div>
            <p className="font-medium text-foreground">保存される項目</p>
            <ul className="mt-1 list-disc list-inside space-y-0.5">
              <li>3. コメント合成オプション</li>
              <li>4. カメラの機種名の表示</li>
              <li>5. {domain} への同時投稿</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-foreground">保存されない項目</p>
            <ul className="mt-1 list-disc list-inside space-y-0.5">
              <li>4. 撮影場所 ※プライバシー保護のため毎回明示的な選択が必要</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
