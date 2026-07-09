import { redirect } from "next/navigation";
import { getCurrentUserWithPreferences } from "@/lib/auth/session";
import { getAvatarUrl } from "@/lib/avatar";
import { getActiveSeason, seasonPeriodLabel } from "@/lib/seasons/catalog";
import prisma from "@/lib/db";
import { CreateClient } from "./CreateClient";
import type {
  Position,
  FontFamily,
  Color,
  Size,
  Arrangement,
  Visibility,
} from "@/types";

/**
 * 投稿ページ（サーバーシェル）
 * 認証とフォーム初期値の取得をサーバー側で行い、CreateClient に props で渡す。
 * 旧来の client 側 fetch("/api/v1/me") を廃止。失効チェック付きでDBを引くため、
 * ログアウト/失効済みセッションはここでリダイレクトされる。
 */
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUserWithPreferences();

  if (!user) {
    redirect("/?reason=login_required&returnTo=%2Fcreate");
  }

  // シーズン（期間限定）: 現在アクティブなシーズンだけをトグル用に渡す（無ければ非表示）。
  // ハイドレーション不整合を避けるためサーバーで判定して props で渡す。
  const active = getActiveSeason(new Date());

  // お知らせ等からの告知用ディープリンク: /create?season=<key>。
  // 指定キーが「今アクティブなシーズン」と一致するときだけ、最初から選択状態にする
  // （無効・別キー・期限切れは無視）。手動でオフにはできる（初期値を入れるだけ）。
  const sp = await searchParams;
  const requestedSeason = typeof sp.season === "string" ? sp.season : undefined;
  const defaultSeasonOn = active != null && requestedSeason === active.key;

  // 初回投稿者向けのやさしいUI用フラグ。
  // - firstTime: これまで1枚も投稿していない（公開/非公開/local問わず全件で判定）
  // - showWelcome: 初回ログイン直後のリダイレクト（/create?welcome=1）で歓迎バナーを出す
  const imageCount = await prisma.image.count({ where: { userId: user.id } });
  const firstTime = imageCount === 0;
  const showWelcome = sp.welcome === "1";

  return (
    <CreateClient
      firstTime={firstTime}
      showWelcome={showWelcome}
      defaultSeasonOn={defaultSeasonOn}
      activeSeason={
        active
          ? {
              key: active.key,
              label: active.label,
              description: active.description,
              period: seasonPeriodLabel(active),
            }
          : null
      }
      user={{
        username: user.username,
        instance: { domain: user.instanceDomain, type: user.instanceType },
        avatarUrl: getAvatarUrl(user.avatarUrl),
      }}
      preferences={{
        position: user.preferences.position as Position | null,
        font: user.preferences.font as FontFamily | null,
        color: user.preferences.color as Color | null,
        size: user.preferences.size as Size | null,
        arrangement: user.preferences.arrangement as Arrangement | null,
        visibility: user.preferences.visibility as Visibility | null,
        cameraOption: user.preferences.cameraOption as "none" | "show" | null,
      }}
    />
  );
}
