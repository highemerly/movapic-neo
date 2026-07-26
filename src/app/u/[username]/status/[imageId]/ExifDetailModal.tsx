"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { ExifDetailDialog } from "./ExifDetailDialog";
import { MetaItem } from "./MetaItem";
import { type ExifDetails } from "@/lib/exif/details";

/**
 * 画像詳細ページのカメラ機種名表示。機種名をボタン化し、クリックでモーダルに撮影情報を出す
 * （PostSourceBadge と同じ UX）。詳細撮影情報（F値・SS・ISO 等）が無い投稿でも開け、その場合は
 * メーカー名のみを表示する。ダイアログ本体は ExifDetailModal と ImageActionsMenu で共有。
 */
type Props = {
  cameraMake: string | null;
  cameraModel: string;
  details: ExifDetails | null;
};

export function ExifDetailModal({ cameraMake, cameraModel, details }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <MetaItem
        as="button"
        onClick={() => setOpen(true)}
        title="撮影情報を表示"
        icon={<Camera className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      >
        {cameraModel}
      </MetaItem>

      <ExifDetailDialog
        cameraMake={cameraMake}
        cameraModel={cameraModel}
        details={details}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
