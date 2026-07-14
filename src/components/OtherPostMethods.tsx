"use client";

import { Mail } from "lucide-react";
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
import { MastodonIcon } from "@/components/icons/MastodonIcon";
import { MisskeyIcon } from "@/components/icons/MisskeyIcon";
import { OrDivider } from "@/components/OrDivider";
import { MentionGuide } from "@/components/post-methods/MentionGuide";
import { EmailGuide } from "@/components/post-methods/EmailGuide";

/**
 * /create のアップロード領域直下に出す「他の投稿方法」。
 * 「または」区切りのあと、Fediverse（メンション）投稿・メール投稿の2ボタンを、
 * カメラ撮影ボタン（ImageUpload）と同じ全幅・破線スタイルで並べる。押すとモーダルで
 * 投稿方法の説明（ダッシュボード／個別ページと同じ MentionGuide / EmailGuide）を表示する。
 * サーバー種別（Mastodon/Misskey）でブランドアイコン・ラベルを出し分ける。
 *
 * 呼び出し側で「写真アップロード前」かつ「初回投稿者でない」ときのみ描画する。
 */

interface OtherPostMethodsProps {
  /** Botのメンション宛先（例 "pic@handon.club"） */
  botAcct: string;
  /** ユーザー固有のメール prefix */
  emailPrefix: string;
  /** メール投稿用ドメイン */
  emailDomain: string;
  /** ログインユーザーの所属サーバードメイン */
  instanceDomain: string;
  /** ログインユーザーのサーバー種別（"misskey" | "mastodon"） */
  instanceType: string;
}

// カメラ撮影ボタン（ImageUpload）と同じ破線の見た目。横2列でも収まるよう
// アイコン上・ラベル下（flex-col）にして、狭い画面幅でも溢れないようにする。
const triggerClass =
  "flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-muted-foreground/25 px-2 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/50";

export function OtherPostMethods({
  botAcct,
  emailPrefix,
  emailDomain,
  instanceDomain,
  instanceType,
}: OtherPostMethodsProps) {
  const isMisskey = instanceType === "misskey";
  const BrandIcon = isMisskey ? MisskeyIcon : MastodonIcon;
  const brandName = isMisskey ? "Misskey" : "Mastodon";

  return (
    <div className="space-y-2">
      <OrDivider />

      {/* 画面幅によらず横2列。DialogContent はポータルされるので、grid の直接の子は
          2つのトリガーボタンになり左右に並ぶ。 */}
      <div className="grid grid-cols-2 gap-2">
      {/* Fediverse（メンション）投稿 */}
      <Dialog>
        <DialogTrigger asChild>
          <button type="button" className={triggerClass}>
            <BrandIcon className="h-5 w-5 shrink-0 text-primary" />
            {brandName}から投稿
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2">
              <BrandIcon className="h-5 w-5" />
              {brandName}から投稿
            </DialogTitle>
            <DialogDescription>
              お使いの{brandName}サーバーから、Botへのメンションで投稿できます。
            </DialogDescription>
          </DialogHeader>

          <MentionGuide
            botAcct={botAcct}
            userInstanceDomain={instanceDomain}
            userInstanceType={instanceType}
          />

          {/* 最後まで読んだあと上までスクロールせず閉じられるよう、末尾にも閉じるボタンを置く */}
          <DialogClose asChild>
            <Button variant="outline" className="w-full">
              閉じる
            </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>

      {/* メール投稿 */}
      <Dialog>
        <DialogTrigger asChild>
          <button type="button" className={triggerClass}>
            <Mail className="h-5 w-5 shrink-0 text-primary" />
            メールから投稿
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              メールから投稿
            </DialogTitle>
            <DialogDescription>
              あなた専用のメールアドレスに画像を送るだけで投稿できます。
            </DialogDescription>
          </DialogHeader>

          <EmailGuide emailPrefix={emailPrefix} emailDomain={emailDomain} />

          <DialogClose asChild>
            <Button variant="outline" className="w-full">
              閉じる
            </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
