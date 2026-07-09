"use client";

import { useEffect, useState } from "react";
import { LegalInfoDialog } from "@/components/legal/LegalInfoDialog";
import { ServiceInfoContent } from "@/components/legal/ServiceInfoContent";

// LoginButton と同じ localStorage キー（前回ログインしたサーバー名）。
// 値があれば過去ログイン済み＝リピーターとみなす。
const LAST_SERVER_KEY = "shamezo.lastServer";

/**
 * 「SHAMEZO（しゃめぞう）とは？」の共通説明ブロック。
 * TOPページ（未ログイン時のログインカード上部）と画像詳細ページのガイド（NewUserGuide）で共有する。
 * 短い説明文の末尾に、より詳しい紹介モーダル（ServiceInfoContent）を開く「もっと詳しく」リンクを添える
 * （かつて LoginButton のピル列にあった「何ができますか？」をこの説明の中へインラインリンクとして移動）。
 *
 * localStorage に前回サーバー名があるリピーターには、利用規約トグルと同様この説明も省略する
 * （初回流入者向けの案内なので既知ユーザーには不要）。SSR と一致させるためマウント後に判定し、
 * 該当すれば非表示にする。下マージン（mb-6）も自身に持たせ、非表示時に余白が残らないようにする。
 */
export function AboutShamezo() {
  const [isReturning, setIsReturning] = useState(false);
  useEffect(() => {
    try {
      // localStorage は外部ストア。SSR と一致させるためマウント後に読む（lazy init だと hydration 不整合）。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(LAST_SERVER_KEY)) setIsReturning(true);
    } catch {
      // localStorage 不可（プライベートモード等）は無視＝説明を出す
    }
  }, []);

  if (isReturning) return null;

  return (
    <div className="mb-6 text-left text-sm leading-relaxed text-muted-foreground">
      <p className="mb-1 font-semibold text-foreground">SHAMEZO（しゃめぞう）とは？</p>
      <p>
        写真にひとことコメントを合成し、Mastodon や Misskey に投稿するアプリです。{" "}
        <LegalInfoDialog
          title="もっと詳しく"
          trigger={
            <button type="button" className="underline hover:text-foreground">
              もっと詳しく
            </button>
          }
        >
          <ServiceInfoContent />
        </LegalInfoDialog>
      </p>
    </div>
  );
}
