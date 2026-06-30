"use client";

import { Textarea } from "@/components/ui/textarea";
import { MAX_TEXT_LENGTH } from "@/types";
import { countGraphemes } from "@/lib/text/grapheme";

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function TextInput({ value, onChange, disabled }: TextInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    // 絵文字（ZWJ結合・国旗・肌色修飾など）を1文字として数える書記素ベース
    if (countGraphemes(newValue) <= MAX_TEXT_LENGTH) {
      onChange(newValue);
    }
  };

  return (
    <Textarea
      id="text-input"
      value={value}
      onChange={handleChange}
      placeholder="例: ねこ / おはよう / いただきます"
      disabled={disabled}
      rows={3}
      className="min-h-[72px] resize-none"
    />
  );
}
