import Link from "@/components/Link";
import { Button } from "@/components/ui/button";

/**
 * サービス紹介モーダル（「もっと詳しく」）の本文。
 * 参考画像はリポジトリ同梱の静的ファイル（public/service-intro.avif）を配信する。
 * 外部CDN直参照だと CSP（img-src）に阻まれるため、同一オリジンから配信して 'self' で許可する。
 */
export function ServiceInfoContent() {
  return (
    <div className="space-y-4 min-w-0 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
      <p>
        SHAMEZO（しゃめぞう）は、写真にひとことコメントを合成して、Mastodon や Misskey に気軽に投稿できるソーシャルネットワーキングサービスです（&ldquo;携帯百景&rdquo;をリスペクトしています）。
      </p>

      <div className="overflow-hidden rounded-lg border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/service-intro.avif"
          alt="SHAMEZOで作成した画像の例"
          loading="lazy"
          decoding="async"
          className="h-auto w-full"
        />
      </div>

      <div>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            写真をアップロードして、好きなコメントを合成。コメントは
            <strong className="font-medium text-foreground">位置（上下左右）・色・大きさ・フォント</strong>
            をカスタマイズできます。
          </li>
          <li>
            作った画像は Mastodon / Misskey に投稿し、かつ SHAMEZO 上でも閲覧できます。
          </li>
          <li>
            投稿はカレンダーで振り返れます。毎日投稿で
            <strong className="font-medium text-foreground">皆勤賞</strong>
            、条件を満たすと
            <strong className="font-medium text-foreground">実績</strong>
            がもらえます。
          </li>
          <li>
            {/* Bot の宛先は環境依存（env）のため、紹介文では具体的な acct を出さない */}
            投稿方法は Web ブラウザのほか、
            <strong className="font-medium text-foreground">メール送信</strong>
            や、公式Botへの
            <strong className="font-medium text-foreground">メンション</strong>
            からでもOK。
          </li>
        </ul>
      </div>

      {/* 他のユーザーの投稿を見てみる（/public へ遷移＝モーダルは離脱で自然に閉じる） */}
      <Link href="/public" className="block">
        <Button className="w-full">他のユーザーの投稿を見てみる</Button>
      </Link>
    </div>
  );
}
