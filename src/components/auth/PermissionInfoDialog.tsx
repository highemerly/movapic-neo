"use client";

import { ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PermissionTabs } from "@/components/auth/PermissionTabs";

/**
 * ログイン時に要求する権限（scope / permission）の説明モーダル。
 * 本体はMastodonとMisskeyのタブ切り替え（PermissionTabs）で、/docs と共有している。
 */

export function PermissionInfoDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-muted/30 px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <ShieldCheck className="size-3.5" />
          必要な権限は？
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>どんな権限を要求しますか？</DialogTitle>
          <DialogDescription>
            SHAMEZOは、あなたのアカウントに対し、以下の権限を要求します。
          </DialogDescription>
        </DialogHeader>

        <PermissionTabs />

        {/* 最後まで読んだあと上までスクロールせず閉じられるよう、末尾にも閉じるボタンを置く */}
        <DialogClose asChild>
          <Button variant="outline" className="w-full">
            閉じる
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
