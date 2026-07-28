import { getCurrentUserWithPreferences } from "@/lib/auth/session";
import { getAllowedServers } from "@/lib/auth/serverPolicy";
import { getAvatarUrl } from "@/lib/avatar";
import { getActiveSeason, seasonPeriodLabel } from "@/lib/seasons/catalog";
import { getBotAcct, getEmailDomain } from "@/lib/postMethods";
import prisma from "@/lib/db";
import { CreateClient } from "./CreateClient";
import type {
  Position,
  FontFamily,
  Color,
  Size,
  Arrangement,
  Visibility,
  CameraOption,
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

  // シーズン（期間限定）: 現在アクティブなシーズンだけをトグル用に渡す（無ければ非表示）。
  // ハイドレーション不整合を避けるためサーバーで判定して props で渡す。
  const active = getActiveSeason(new Date());

  // お知らせ等からの告知用ディープリンク: /create?season=<key>。
  // 指定キーが「今アクティブなシーズン」と一致するときだけ、最初から選択状態にする
  // （無効・別キー・期限切れは無視）。手動でオフにはできる（初期値を入れるだけ）。
  const sp = await searchParams;
  const requestedSeason = typeof sp.season === "string" ? sp.season : undefined;
  const defaultSeasonOn = active != null && requestedSeason === active.key;

  const activeSeasonProps = active
    ? {
        key: active.key,
        label: active.label,
        description: active.description,
        period: seasonPeriodLabel(active),
      }
    : null;

  // 未ログインでもプレビューまでは試せるようにする（生成APIは認証不要）。
  // 投稿だけはログインが要るので「ログインして投稿」で下書きを退避→ログイン往復→
  // /create?restore=1 で復元し、手動で投稿する導線に流す（CreateClient 側で実装）。
  // 撮影情報/公開範囲/設定保存など認証・連携先が要る機能はゲストでは非表示。
  if (!user) {
    return (
      <CreateClient
        guest
        allowedServers={getAllowedServers()}
        // ゲストは「まだ投稿したことがない人」なので、初回ユーザーと同じ簡素化UIを適用する
        // （②以降は「文字の色や位置を変える」ボタンの奥に畳み、写真→コメント→プレビューの最短動線に）。
        firstTime={true}
        showWelcome={false}
        defaultSeasonOn={defaultSeasonOn}
        activeSeason={activeSeasonProps}
        user={{
          username: "",
          instance: { domain: "", type: "" },
          avatarUrl: null,
        }}
        postMethods={{ botAcct: null, emailPrefix: "", emailDomain: null }}
        preferences={{
          position: null,
          font: null,
          color: null,
          size: null,
          arrangement: null,
          visibility: null,
          cameraOption: null,
        }}
      />
    );
  }

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
      activeSeason={activeSeasonProps}
      user={{
        username: user.username,
        instance: { domain: user.instanceDomain, type: user.instanceType },
        avatarUrl: getAvatarUrl(user.avatarUrl),
      }}
      postMethods={{
        botAcct: getBotAcct(),
        emailPrefix: user.emailPrefix,
        emailDomain: getEmailDomain(),
      }}
      preferences={{
        position: user.preferences.position as Position | null,
        font: user.preferences.font as FontFamily | null,
        color: user.preferences.color as Color | null,
        size: user.preferences.size as Size | null,
        arrangement: user.preferences.arrangement as Arrangement | null,
        visibility: user.preferences.visibility as Visibility | null,
        cameraOption: user.preferences.cameraOption as CameraOption | null,
      }}
    />
  );
}
