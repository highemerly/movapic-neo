"use client";

import { Visibility, VISIBILITY_LABELS } from "@/types";
import { SegmentControl } from "@/components/SegmentControl";

interface VisibilityPickerProps {
  value: Visibility;
  onChange: (value: Visibility) => void;
  disabled?: boolean;
}

const VISIBILITIES: Visibility[] = ["public", "unlisted", "local"];

export function VisibilityPicker({ value, onChange, disabled }: VisibilityPickerProps) {
  return (
    <SegmentControl
      value={value}
      options={VISIBILITIES}
      onChange={onChange}
      disabled={disabled}
      renderOption={(v) => VISIBILITY_LABELS[v]}
    />
  );
}
