"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import Link from "@/components/Link";

/**
 * Bot（メンション）投稿の説明。ダッシュボード・/create/bot・/create のモーダルで共有する。
 * サーバー種別（Mastodon/Misskey）で share 画面の公開範囲だけ出し分ける。
 */

interface MentionGuideProps {
  /** Botのメンション宛先（例 "pic@handon.club"） */
  botAcct: string;
  /** ログインユーザーの所属サーバードメイン（/share 投稿画面・プロフィールリンク用） */
  userInstanceDomain: string;
  /** ログインユーザーのサーバー種別（"misskey" | "mastodon"）。share の visibility 出し分け用 */
  userInstanceType: string;
}

export function MentionGuide({
  botAcct,
  userInstanceDomain,
  userInstanceType,
}: MentionGuideProps) {
  const [isCopied, setIsCopied] = useState(false);

  const botMention = `@${botAcct}`;

  // Botへのメンションは削除して再投稿される一時的な投稿なので、できるだけ目立たない公開範囲で
  // 投稿画面を開く。Mastodon は direct（自分とBotのみ）、Misskey は home（ホーム）。
  // どちらも /share の visibility パラメータで初期値を指定できる
  // （Mastodon: PR #13023、Misskey: share form）。
  const shareVisibility = userInstanceType === "misskey" ? "home" : "direct";
  const buildShareUrl = (text: string) =>
    `https://${userInstanceDomain}/share?text=${encodeURIComponent(text)}&visibility=${shareVisibility}`;

  // botAcct: "pic@handon.club" -> "https://handon.club/@pic"
  const botProfileUrl = (() => {
    const [username, domain] = botAcct.split("@");
    return `https://${domain}/@${username}`;
  })();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(botMention);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="space-y-4">

      <div className="text-sm space-y-3">
        <p className="font-medium">投稿の形式:</p>
        <ul className="list-disc list-inside space-y-2 ml-2">
          <li>
            <strong>宛先:</strong>
            <span className="inline-flex items-center gap-2 align-middle ml-2">
              <a
                href={botProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-primary hover:underline"
              >
                {botMention}
              </a>
              <button
                type="button"
                onClick={handleCopy}
                className="p-2 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="コピー"
              >
                {isCopied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </span>
          </li>
          <li>
            <strong>本文:</strong> 画像に入れるテキスト（〜140文字）
          </li>
          <li>
            <strong>添付:</strong> 画像ファイル1枚
          </li>
        </ul>
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <code className="block text-xs bg-background p-2 rounded border">
            @{botAcct} マックチキン！
          </code>
          <a
            href={buildShareUrl(`@${botAcct} マックチキン！`)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-primary hover:underline"
          >
            → {userInstanceDomain}で投稿画面を開く
          </a>
        </div>
      </div>

      <div className="text-sm space-y-3">
        <p className="font-medium">オプション:</p>
        <p className="text-muted-foreground">本文の前に [上 赤 大] のように角括弧＋スペース区切りで指定することもできます（指定がない場合、<Link href="/settings#defaults" className="text-primary hover:underline">初期設定</Link>に従います）。</p>
        <ul className="list-disc list-inside space-y-2 ml-2">
          <li>
            <strong>位置:</strong> 上 下 左 右
          </li>
          <li>
            <strong>色:</strong> 白 赤 青 緑 黄 茶 桃 橙
          </li>
          <li>
            <strong>サイズ:</strong> 小 中 大 特大
          </li>
          <li>
            <strong>フォント:</strong> ふい字 ゴシック ラノベ
          </li>
          <li>
            <strong>アレンジ:</strong> ネオン ハンコ
          </li>
          <li>
            <strong>公開範囲:</strong> public unlisted
          </li>
        </ul>
        <p className="text-muted-foreground text-xs">※カメラ機種および位置情報には非対応です</p>
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <code className="block text-xs bg-background p-2 rounded border">
            @{botAcct} [右 赤 ネオン] マックチキン！
          </code>
          <a
            href={buildShareUrl(`@${botAcct} [右 赤 ネオン] マックチキン！`)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-primary hover:underline"
          >
            → {userInstanceDomain}で投稿画面を開く
          </a>
        </div>
      </div>
    </div>
  );
}
