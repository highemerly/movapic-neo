"use client";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
    <div className="space-y-2">
      <Textarea
        id="text-input"
        value={value}
        onChange={handleChange}
        placeholder="合成するコメントを入力してください（最大140文字）"
        disabled={disabled}
        className="min-h-[100px] resize-none"
      />
      <span className="text-sm text-muted-foreground">
          {value.length} / {MAX_TEXT_LENGTH}
      </span>
    </div>
  );
}
