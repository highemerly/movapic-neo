import { cn } from "@/lib/utils";

interface MisskeyIconProps {
  className?: string;
}

export function MisskeyIcon({ className }: MisskeyIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("w-4 h-4", className)}
      aria-hidden="true"
    >
      <path d="M4 5h2.2l5.8 8 5.8-8H20v14h-2.4V9.6l-4.6 6.3h-2L6.4 9.6V19H4V5z" />
    </svg>
  );
}
