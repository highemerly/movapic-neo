"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FontLicenseCard } from "./FontLicenseCard";
import type { FontLicense } from "@/lib/fonts/licenses";

/**
 * 単一フォントのライセンスをモーダルで表示する。トリガー（フォント名バッジ等）を渡す。
 * 内容は /license ページと共有の FontLicenseCard を使うため表記は常に一致する。
 */
export function FontLicenseDialog({
  license,
  trigger,
}: {
  license: FontLicense;
  trigger: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent aria-describedby={undefined} className="max-h-[85vh] overflow-y-auto px-3 py-4">
        <DialogHeader>
          <DialogTitle>フォントライセンス</DialogTitle>
        </DialogHeader>
        <FontLicenseCard license={license} />
        <DialogClose asChild>
          <Button variant="outline" className="w-full">
            閉じる
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
