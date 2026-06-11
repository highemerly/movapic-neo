import { redirect } from "next/navigation";
import { getCurrentUserWithPreferences } from "@/lib/auth/session";
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
export default async function CreatePage() {
  const user = await getCurrentUserWithPreferences();

  if (!user) {
    redirect("/?reason=login_required&returnTo=%2Fcreate");
  }

  return (
    <CreateClient
      user={{
        username: user.username,
        instance: { domain: user.instanceDomain, type: user.instanceType },
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
