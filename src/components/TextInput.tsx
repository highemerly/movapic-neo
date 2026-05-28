"use client";

import { Textarea } from "@/components/ui/textarea";
import { MAX_TEXT_LENGTH } from "@/types";

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function TextInput({ value, onChange, disabled }: TextInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= MAX_TEXT_LENGTH) {
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
