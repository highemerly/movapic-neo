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
              : "現在の設定を初期値として保存（位置情報は除く）"}
        </span>
      </button>
    </div>
  );
}
