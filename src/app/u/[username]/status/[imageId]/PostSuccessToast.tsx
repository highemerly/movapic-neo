"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

export function PostSuccessToast() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 top-14 z-[60] flex justify-center px-4">
      <div className="flex w-full max-w-md items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 shadow-lg backdrop-blur">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
        <p className="flex-1 text-sm font-medium text-green-700 dark:text-green-300">
          投稿が完了しました
        </p>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="shrink-0 text-green-600/70 transition-colors hover:text-green-600 dark:text-green-400/70"
          aria-label="閉じる"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
