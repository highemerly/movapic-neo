"use client";

import { Visibility, VISIBILITY_LABELS } from "@/types";

interface VisibilityPickerProps {
  value: Visibility;
  onChange: (value: Visibility) => void;
  disabled?: boolean;
}

const VISIBILITIES: Visibility[] = ["public", "unlisted", "local"];

export function VisibilityPicker({ value, onChange, disabled }: VisibilityPickerProps) {
  return (
    <div className="flex rounded-lg border bg-muted p-1 gap-1">
      {VISIBILITIES.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          disabled={disabled}
          className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
            value === v
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {VISIBILITY_LABELS[v]}
        </button>
      ))}
    </div>
  );
}
