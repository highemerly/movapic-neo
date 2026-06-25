import Link from "@/components/Link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LoginButton } from "@/components/auth/LoginButton";

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
      <section className="mt-4 flex gap-2">
        <Link href="/public" className="block flex-1">
          <Button variant="outline" className="w-full">
            みんなの写真をみる
          </Button>
        </Link>
        <Link href="/dashboard" className="block flex-1">
          <Button variant="outline" className="w-full">
            ダッシュボードへ
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
      <div className="mb-6 text-center text-sm leading-relaxed text-muted-foreground">
        <p className="mb-1 font-semibold text-foreground">SHAMEZO（しゃめぞう）とは？</p>
        <p>
          写真に「ひとこと」コメントを合成して、Mastodon に投稿できるサービスです。
        </p>
      </div>

      {/* 今すぐ投稿する（TOPと共通のログインロジック） */}
      <div>
        <p className="mb-3 text-center text-sm font-semibold">今すぐログインして投稿してみよう！</p>
        <div className="mx-auto max-w-sm">
          <LoginButton
            allowedServers={allowedServers}
            callbackUrl={POST_LOGIN_REDIRECT}
            initialIsLoggedIn={false}
          />
        </div>
      </div>

      {/* または */}
      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        または
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* 他のユーザーの投稿を見てみる */}
      <div className="mx-auto max-w-sm">
        <Link href="/public" className="block">
          <Button variant="outline" className="w-full">
            他のユーザーの投稿を見てみる
          </Button>
        </Link>
      </div>
    </section>
  );
}
