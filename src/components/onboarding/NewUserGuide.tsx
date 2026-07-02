import Link from "@/components/Link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LoginButton } from "@/components/auth/LoginButton";
import { LoginPrompt } from "@/components/auth/LoginPrompt";

interface NewUserGuideProps {
  /** サーバー側で判定したログイン状態 */
  isLoggedIn: boolean;
  /** 許可サーバー（自由入力の場合は undefined） */
  allowedServers?: string[];
}

// ログイン成功後は投稿ページへ送る。失敗時はコールバック側の仕様で TOP（/?error=...）に飛ぶ。
const POST_LOGIN_REDIRECT = "/create";

/**
 * 画像ページ（SNSからの初回流入が多い）の最下部・フッター直前に出す新規ユーザー向けガイド。
 * - 非ログイン: SHAMEZO紹介 ＋「今すぐ投稿」ログイン ＋ 公開TL導線（並列の選択肢）
 * - ログイン済み: 公開TL導線のみ
 * ログインの詳細ロジックは TOP ページと同じ LoginButton をそのまま利用する（完全共通化）。
 */
export function NewUserGuide({ isLoggedIn, allowedServers }: NewUserGuideProps) {
  // ログイン済みユーザーには公開TLへの導線だけを軽く出す
  if (isLoggedIn) {
    return (
      <section className="mt-4">
        <Link href="/public" className="block">
          <Button variant="outline" className="w-full">
            みんなの写真をみる
          </Button>
        </Link>
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-3 flex justify-center">
        <Image
          src="/shamezo_logo_with_tagline.svg"
          alt="SHAMEZO"
          width={260}
          height={58}
          className="h-auto w-auto max-w-full"
        />
      </div>

      {/* SHAMEZOとは？ */}
      <div className="mb-6 text-left text-sm leading-relaxed text-muted-foreground">
        <p className="mb-1 font-semibold text-foreground">SHAMEZO（しゃめぞう）とは？</p>
        <p>
          写真にひとことコメントを合成し、Mastodon や Misskey に投稿するアプリです。
        </p>
      </div>

      {/* 今すぐ投稿する〜他のユーザーの投稿を見てみる（TOPと共通ブロック） */}
      <LoginPrompt>
        <LoginButton
          allowedServers={allowedServers}
          callbackUrl={POST_LOGIN_REDIRECT}
          initialIsLoggedIn={false}
        />
      </LoginPrompt>
    </section>
  );
}
