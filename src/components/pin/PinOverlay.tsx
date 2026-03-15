import { Pin } from "lucide-react";

interface PinOverlayProps {
  isPinned: boolean;
}

export function PinOverlay({ isPinned }: PinOverlayProps) {
  if (!isPinned) {
    return null;
  }

  return (
    <div className="absolute top-0 right-0 p-1.5 h-8 flex items-center text-white text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
      <Pin className="h-3 w-3 fill-current" />
    </div>
  );
}
