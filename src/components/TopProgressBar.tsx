"use client";

interface TopProgressBarProps {
  active: boolean;
  label?: string;
}

export function TopProgressBar({ active, label }: TopProgressBarProps) {
  return (
    <div
      aria-hidden={!active}
      className={`pointer-events-none fixed inset-x-0 top-0 z-[70] transition-opacity duration-150 ${
        active ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="relative h-[3px] w-full overflow-hidden bg-primary/15">
        <div className="animate-top-progress absolute inset-y-0 left-0 w-1/3 bg-primary" />
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
