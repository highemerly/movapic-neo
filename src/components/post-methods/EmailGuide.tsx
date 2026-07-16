"use client";

import Link from "@/components/Link";
import { EmailAddressDisplay } from "./EmailAddressDisplay";

/**
 * メール投稿の説明。ダッシュボード・/create/mail・/create のモーダルで共有する。
 * ユーザー固有の宛先アドレス（emailPrefix@emailDomain）と、そのアドレス向けの mailto: 例を組み立てる。
 */

interface EmailGuideProps {
  /** ユーザー固有のメール prefix */
  emailPrefix: string;
  /** メール投稿用ドメイン（例 "pic.handon.club"） */
  emailDomain: string;
}

export function EmailGuide({ emailPrefix, emailDomain }: EmailGuideProps) {
  const emailAddress = `${emailPrefix}@${emailDomain}`;
  const mailtoPlain = `mailto:${emailAddress}?body=${encodeURIComponent("マックチキン！")}`;
  const mailtoWithOptions = `mailto:${emailAddress}?subject=${encodeURIComponent("下 赤 大 都道府県")}&body=${encodeURIComponent("マックチキン！")}`;

  return (
    <div className="space-y-4">

      <div className="text-sm space-y-3">
        <p className="font-medium">メールの内容:</p>
        <ul className="list-disc list-inside space-y-2 ml-2">
          <EmailAddressDisplay emailPrefix={emailPrefix} emailDomain={emailDomain} />
          <li>
            <strong>本文:</strong> 画像に入れるテキスト（〜140文字）
          </li>
          <li>
            <strong>添付:</strong> 画像ファイル1枚
          </li>
        </ul>
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <code className="block text-xs bg-background p-2 rounded border whitespace-pre-line">
            {"本文：マックチキン！"}
          </code>
          <a
            href={mailtoPlain}
            className="inline-block text-xs text-primary hover:underline"
          >
            → メールアプリで送信する
          </a>
        </div>
      </div>

      <div className="text-sm space-y-3">
        <p className="font-medium">オプション:</p>
        <p className="text-muted-foreground">件名にスペース区切りでオプションを指定することもできます（指定がない場合、<Link href="/settings#defaults" className="text-primary hover:underline">初期設定</Link>に従います）。</p>
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
          <li>
            <strong>カメラ機種:</strong> カメラ カメラなし
          </li>
          <li>
            <strong>位置情報:</strong> 都道府県 市町村
          </li>
        </ul>
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <code className="block text-xs bg-background p-2 rounded border whitespace-pre-line">
            {"件名：下 赤 大 都道府県\n本文：マックチキン！"}
          </code>
          <a
            href={mailtoWithOptions}
            className="inline-block text-xs text-primary hover:underline"
          >
            → メールアプリで送信する
          </a>
        </div>
      </div>
    </div>
  );
}
