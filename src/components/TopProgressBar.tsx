"use client";

interface TopProgressBarProps {
  active: boolean;
  label?: string;
  /** 0〜100 を渡すと確定進捗バー（幅=%）を表示。未指定なら不定バー（左右に流れる）。 */
  progress?: number;
}

export function TopProgressBar({ active, label, progress }: TopProgressBarProps) {
  const determinate = typeof progress === "number";
  const pct = determinate ? Math.min(100, Math.max(0, progress)) : 0;
  return (
    <div
      aria-hidden={!active}
      className={`pointer-events-none fixed inset-x-0 top-0 z-[70] transition-opacity duration-150 ${
        active ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="relative h-[3px] w-full overflow-hidden bg-primary/15">
        {determinate ? (
          <div
            className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="animate-top-progress absolute inset-y-0 left-0 w-1/3 bg-primary" />
        )}
      </div>
      {label && active && (
        <div className="flex justify-center">
          <span className="mt-2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-md">
            {label}
          </span>
        </div>
      )}
    </div>
  );
}
