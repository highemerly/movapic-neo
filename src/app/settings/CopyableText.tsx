"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CopyableTextProps {
  text: string;
}

export function CopyableText({ text }: CopyableTextProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="flex items-start gap-2">
      <code className="bg-background px-2 py-1 rounded text-sm break-all">
        {text}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        title="コピー"
      >
        {isCopied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
