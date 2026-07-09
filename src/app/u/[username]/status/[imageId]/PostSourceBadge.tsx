"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { MastodonIcon } from "@/components/icons/MastodonIcon";
import { MisskeyIcon } from "@/components/icons/MisskeyIcon";
import Link from "@/components/Link";
import {
  DEFAULT_POSITION,
  DEFAULT_COLOR,
  DEFAULT_SIZE,
  DEFAULT_FONT,
  DEFAULT_ARRANGEMENT,
} from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/**
 * 画像詳細ページの投稿ソース表示（Bot / メール）。
 * アイコン＋文字列のボタンで、クリックすると投稿方法をシンプルに説明するモーダルを開く。
 * Web投稿は既定なので表示しない（呼び出し側で分岐）。
 */
// オプション値 → コマンドの日本語キーワード（@/lib/options/maps の逆引き）。
// この投稿に使われたであろうコマンドを再現するための表示専用。厳密でなくてよい。
const POSITION_KW: Record<string, string> = {
  top: "上",
  bottom: "下",
  left: "左",
  right: "右",
};
const COLOR_KW: Record<string, string> = {
  white: "白",
  red: "赤",
  blue: "青",
  green: "緑",
  yellow: "黄",
  brown: "茶",
  pink: "桃",
  orange: "橙",
};
const SIZE_KW: Record<string, string> = {
  small: "小",
  medium: "中",
  large: "大",
  "extra-large": "特大",
};
const FONT_KW: Record<string, string> = {
  "hui-font": "ふい字",
  "noto-sans-jp": "ゴシック",
  "light-novel-pop": "ラノベ",
};
const ARRANGEMENT_KW: Record<string, string> = {
  neon: "ネオン",
  stamp: "ハンコ",
};

/**
 * この投稿のオプションから Bot コマンドの `[...]` 部分を組み立てる。
 * SHAMEZO 全体のデフォルト値と一致するものはコマンドで打っていないはずなので省略する
 * （ユーザーのデフォルト設定は考慮しない＝厳密でなくてよい）。
 */
function buildCommandOptions(opts: {
  position?: string;
  color?: string;
  size?: string;
  font?: string;
  arrangement?: string;
}): string {
  const parts = [
    opts.position !== DEFAULT_POSITION ? POSITION_KW[opts.position ?? ""] : null,
    opts.color !== DEFAULT_COLOR ? COLOR_KW[opts.color ?? ""] : null,
    opts.size !== DEFAULT_SIZE ? SIZE_KW[opts.size ?? ""] : null,
    opts.font !== DEFAULT_FONT ? FONT_KW[opts.font ?? ""] : null,
    opts.arrangement !== DEFAULT_ARRANGEMENT
      ? ARRANGEMENT_KW[opts.arrangement ?? ""]
      : null,
  ].filter(Boolean);
  return parts.join(" ");
}

type Props = {
  source: "mention" | "email";
  /** Bot: 投稿ユーザーの所属サーバー種別（アイコン切替用） */
  instanceType?: string;
  /** Bot: 表示・説明に使う Bot のアカウント（例: dev01@handon.club） */
  botAcct?: string;
  /** Bot: この投稿を再現するコマンド例のオプション・テキスト */
  position?: string;
  color?: string;
  size?: string;
  font?: string;
  arrangement?: string;
  text?: string;
};

export function PostSourceBadge({
  source,
  instanceType,
  botAcct,
  position,
  color,
  size,
  font,
  arrangement,
  text,
}: Props) {
  const [open, setOpen] = useState(false);

  const isMention = source === "mention";
  const Icon = isMention
    ? instanceType === "misskey"
      ? MisskeyIcon
      : MastodonIcon
    : Mail;
  const label = isMention ? "Bot" : "メール";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 -my-1 py-1 hover:text-foreground transition-colors"
        title={isMention ? "Bot投稿について" : "メール投稿について"}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-[160px] truncate">{label}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {isMention ? (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="flex items-center gap-2">
                  <Icon className="h-5 w-5 shrink-0" />
                  Bot投稿
                </DialogTitle>
                <DialogDescription className="text-left">
                  この投稿は以下のメンションで投稿されました。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-left text-sm">
                <p className="text-muted-foreground">
                  <span className="font-mono">
                    @{botAcct}
                    {(() => {
                      const cmd = buildCommandOptions({
                        position,
                        color,
                        size,
                        font,
                        arrangement,
                      });
                      return cmd ? ` [${cmd}]` : "";
                    })()}
                    {text ? ` ${text}` : ""}
                  </span>
                </p>
                <p>
                  お使いの Mastodon / Misskey アカウントから、
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    @{botAcct}
                  </span>{" "}
                  （SHAMEZO公式Bot）宛に画像・コメントを送ると、合成して再投稿できます。
                </p>
              </div>
            </>
          ) : (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5 shrink-0" />
                  メール投稿
                </DialogTitle>
                <DialogDescription className="text-left">
                  この投稿はメール送信して投稿されました。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-left text-sm">
                <p>
                  あなた専用のメールアドレスに画像を添付して送信すると、本文の内容を合成して投稿できます。
                </p>
                <p className="text-xs text-muted-foreground">
                  あなたのメールアドレスは{" "}
                  <Link href="/dashboard" className="underline hover:text-foreground">
                    ダッシュボード
                  </Link>{" "}
                  で確認してください。
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
