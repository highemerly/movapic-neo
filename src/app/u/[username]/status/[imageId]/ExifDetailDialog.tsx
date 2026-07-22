"use client";

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

export type ExifDetailData = {
  cameraMake: string | null;
  cameraModel: string;
  details: ExifDetails | null;
};

type Props = ExifDetailData & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * 写真の詳細情報（EXIF）ダイアログの本体（表示専用）。
 * インラインの機種名ボタン（ExifDetailModal）と、ミートボールメニューの「詳細情報を表示」の
 * 双方から同じ内容を開けるよう、トリガーを持たない表示部だけを切り出したもの。
 */
export function ExifDetailDialog({
  cameraMake,
  cameraModel,
  details,
  open,
  onOpenChange,
}: Props) {
  // メーカー名・機種名を先頭に、続けて定義順（レンズ→焦点距離→…）で値のある項目だけ行にする。
  const rows: { label: string; value: string }[] = [
    ...(cameraMake ? [{ label: "メーカー", value: cameraMake }] : []),
    { label: "機種名", value: cameraModel },
    ...(Object.keys(EXIF_DETAIL_LABELS) as (keyof ExifDetails)[])
      .map((key) => {
        const label = EXIF_DETAIL_LABELS[key];
        const raw = details?.[key];
        // 値にラベルが前置されている場合（例 "35mm換算 25mm"）は重複を除く。
        // 値は ALT テキスト用にラベル無しでも意味が通るよう前置付きで保存されるため
        // （exifDetailValues）、除去はラベル付きで並べるこのモーダル表示側で行う。
        const value = raw?.startsWith(`${label} `) ? raw.slice(label.length + 1) : raw;
        return { label, value };
      })
      .filter((r): r is { label: string; value: string } => !!r.value),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 shrink-0" aria-hidden />
            写真の詳細情報
          </DialogTitle>
          <DialogDescription className="text-left">
            詳細情報（EXIF）のうち、ユーザーが記録を希望した情報のみ表示しています。
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
  );
}
