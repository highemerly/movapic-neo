"use client";

import { Visibility, visibilityLabels } from "@/types";
import { SegmentControl } from "@/components/SegmentControl";

interface VisibilityPickerProps {
  value: Visibility;
  onChange: (value: Visibility) => void;
  disabled?: boolean;
  /** 連携先の種別（"mastodon" | "misskey"）。ラベルの用語を合わせる。 */
  instanceType?: string;
}

const VISIBILITIES: Visibility[] = ["public", "unlisted", "local"];

export function VisibilityPicker({ value, onChange, disabled, instanceType }: VisibilityPickerProps) {
  const labels = visibilityLabels(instanceType);
  return (
    <SegmentControl
      value={value}
      options={VISIBILITIES}
      onChange={onChange}
      disabled={disabled}
      renderOption={(v) => labels[v]}
    />
  );
}
