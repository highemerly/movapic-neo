import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * next/link のラッパー。
 *
 * App Router の <Link> はビューポートに入った瞬間に対象ルートを自動プリフェッチ
 * （RSC ペイロード取得 = ?_rsc=...）する。画像カードのグリッド等では表示しただけで
 * 数十件のリクエストが走るため、デフォルトを prefetch={false} に倒している。
 *
 * prefetch={false} でもホバー/フォーカス時にはプリフェッチされるため、
 * 実際にユーザーが遷移しようとしたときの体感速度は維持される。
 * 主要動線で積極的に先読みしたい箇所だけ prefetch を明示指定する。
 */
export default function Link({
  prefetch = false,
  ...props
}: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
