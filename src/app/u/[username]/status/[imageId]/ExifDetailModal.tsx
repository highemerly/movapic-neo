"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  EXIF_DETAIL_LABELS,
  type ExifDetails,
} from "@/lib/exif/details";

/**
 * 画像詳細ページのカメラ機種名表示。機種名をボタン化し、クリックでモーダルに撮影情報を出す
 * （PostSourceBadge と同じ UX）。詳細撮影情報（F値・SS・ISO 等）が無い投稿でも開け、その場合は
 * メーカー名のみを表示する。
 */
type Props = {
  cameraMake: string | null;
  cameraModel: string;
  details: ExifDetails | null;
};

export function ExifDetailModal({ cameraMake, cameraModel, details }: Props) {
  const [open, setOpen] = useState(false);

  // メーカー名を先頭に、続けて定義順（レンズ→焦点距離→…）で値のある項目だけ行にする。
  const rows: { label: string; value: string }[] = [
    ...(cameraMake ? [{ label: "メーカー", value: cameraMake }] : []),
    ...(Object.keys(EXIF_DETAIL_LABELS) as (keyof ExifDetails)[])
      .map((key) => ({ label: EXIF_DETAIL_LABELS[key], value: details?.[key] }))
      .filter((r): r is { label: string; value: string } => !!r.value),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-[3px] -my-1 py-1 hover:text-foreground transition-colors"
        title="撮影情報を表示"
      >
        <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {cameraModel}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 shrink-0" aria-hidden />
              {cameraModel}
            </DialogTitle>
            <DialogDescription className="text-left">
              この写真の撮影情報（EXIF）です。
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {rows.map((r) => (
              <div key={r.label} className="contents">
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd className="text-right tabular-nums">{r.value}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}
