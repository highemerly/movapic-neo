"use client";

import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

export interface ConfirmOptions {
  /** モーダル見出し（省略時は「確認」） */
  title?: React.ReactNode;
  /** 本文。改行（\n）はそのまま表示される */
  description?: React.ReactNode;
  /** 実行ボタンの文言（省略時は「OK」） */
  confirmText?: string;
  /** キャンセルボタンの文言（省略時は「キャンセル」） */
  cancelText?: string;
  /** 削除など破壊的操作の場合は実行ボタンを赤系にする */
  destructive?: boolean;
}

type ConfirmFn = (options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

/**
 * 共通の確認モーダルを開く。`await confirm({...})` が true/false を返すので
 * ブラウザの `window.confirm()` をそのまま置き換えられる。
 */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm は ConfirmProvider の内側で使用してください");
  }
  return ctx;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ConfirmState>({ open: false });
  const resolverRef = React.useRef<((value: boolean) => void) | null>(null);

  const confirm = React.useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({ ...options, open: true });
    });
  }, []);

  const settle = React.useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={state.open}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state.title ?? "確認"}</AlertDialogTitle>
            {state.description != null && (
              <AlertDialogDescription className="whitespace-pre-line">
                {state.description}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {state.cancelText ?? "キャンセル"}
            </AlertDialogCancel>
            <AlertDialogAction
              className={
                state.destructive
                  ? buttonVariants({ variant: "destructive" })
                  : undefined
              }
              onClick={() => settle(true)}
            >
              {state.confirmText ?? "OK"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
