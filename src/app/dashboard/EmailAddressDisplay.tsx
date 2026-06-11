"use client";

import { useState } from "react";
import { Copy, Check, Eye, EyeOff } from "lucide-react";

interface EmailAddressDisplayProps {
  emailPrefix: string;
  emailDomain: string;
}

export function EmailAddressDisplay({ emailPrefix, emailDomain }: EmailAddressDisplayProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const fullEmail = `${emailPrefix}@${emailDomain}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullEmail);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <li>
      <strong>宛先:</strong>
      <span className="mt-1 ml-[1.5em] flex items-center gap-2 sm:mt-0 sm:ml-2 sm:inline-flex sm:align-middle">
        <code className="flex-1 min-w-0 bg-background px-2 py-1 rounded text-xs break-all sm:flex-none">
          {isVisible ? (
            fullEmail
          ) : (
            <span className="blur-sm select-none" aria-hidden="true">{fullEmail}</span>
          )}
        </code>
        <div className="flex gap-1 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="コピー"
          >
            {isCopied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setIsVisible(!isVisible)}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title={isVisible ? "隠す" : "表示"}
            aria-label={isVisible ? "隠す" : "表示"}
          >
            {isVisible ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </span>
    </li>
  );
}
