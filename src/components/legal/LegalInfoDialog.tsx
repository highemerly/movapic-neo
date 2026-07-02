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

/**
 * 利用規約／プライバシーポリシーを読むための汎用モーダル。
 * トリガー要素（pill やインラインリンク等）を渡し、本文（TermsContent / PrivacyContent）を children で渡す。
 * 内容そのものは /terms・/privacy ページと共有コンポーネントで一致させている。
 */
export function LegalInfoDialog({
  title,
  trigger,
  children,
}: {
  title: string;
  trigger: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* 既定の p-6 は広すぎるので詰める。横は特に狭い端末で効くので px-3、縦は py-4 */}
      <DialogContent aria-describedby={undefined} className="max-h-[85vh] overflow-y-auto px-3 py-4">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
        {/* 長文を最後まで読んだあと上までスクロールせず閉じられるよう、末尾にも閉じるボタンを置く */}
        <DialogClose asChild>
          <Button variant="outline" className="w-full">
            閉じる
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
