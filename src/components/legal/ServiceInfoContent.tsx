/**
 * サービス紹介モーダル（「なにができるサービスですか？」）の本文。
 * 説明文はごく短いプレースホルダ（運営者があとで手で修正する前提）。
 * 参考画像はリポジトリ同梱の静的ファイル（public/service-intro.avif）を配信する。
 * 外部CDN直参照だと CSP（img-src）に阻まれるため、同一オリジンから配信して 'self' で許可する。
 */
export function ServiceInfoContent() {
  return (
    <div className="space-y-4 min-w-0 [overflow-wrap:anywhere]">
      <p className="text-sm text-muted-foreground">
        写真にひとことコメントを合成して、Mastodon や Misskey に気軽に投稿できるソーシャルネットワーキングサービスです（&ldquo;携帯百景&rdquo;をリスペクトしています）。
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
    </div>
  );
}
