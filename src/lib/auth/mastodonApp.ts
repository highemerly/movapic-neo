/**
 * Mastodon アプリ登録（動的クライアント登録）のインスタンス単位での再利用。
 *
 * 従来はログイン開始のたびに POST /api/v1/apps で新規アプリを登録していたため、
 * ユーザーの「認証済みアプリ」一覧にログイン回数ぶん SHAMEZO が並んでしまっていた。
 * 登録済みの client_id/secret を Instance に暗号化保存して使い回すことで、
 * 再ログインは「同一アプリの再認可」になり一覧には1件だけ表示される。
 */

import prisma from "@/lib/db";
import { registerMastodonApp, type MastodonAppCredentials } from "@/lib/auth/fediverse";
import { encryptToken, decryptToken } from "@/lib/auth/tokens";

/**
 * インスタンスに保存済みのアプリ資格情報を返す。無ければ新規登録して保存する。
 *
 * redirect_uri は登録時にアプリへ固定されるため、NEXT_PUBLIC_APP_URL の変更などで
 * 現在の redirectUri と保存時のものが食い違うと認可画面が通らなくなる。
 * その場合は保存値を捨てて再登録する（appRedirectUri はこの検知のために保存している）。
 */
export async function getOrRegisterMastodonApp(
  domain: string,
  redirectUri: string
): Promise<MastodonAppCredentials> {
  const instance = await prisma.instance.findUnique({
    where: { domain },
    select: { clientId: true, clientSecret: true, appRedirectUri: true },
  });

  if (instance?.clientId && instance.clientSecret && instance.appRedirectUri === redirectUri) {
    try {
      return {
        clientId: decryptToken(instance.clientId),
        clientSecret: decryptToken(instance.clientSecret),
      };
    } catch {
      // TOKEN_ENCRYPTION_KEY の変更等で復号できない場合は再登録にフォールバック
      console.warn(`[mastodon-app] ${domain} の保存済みアプリ資格情報を復号できないため再登録します`);
    }
  }

  const credentials = await registerMastodonApp(domain, redirectUri);

  // Instance 行はコールバック（ユーザー作成時）より先にここで作られることがある
  await prisma.instance.upsert({
    where: { domain },
    create: {
      domain,
      type: "mastodon",
      clientId: encryptToken(credentials.clientId),
      clientSecret: encryptToken(credentials.clientSecret),
      appRedirectUri: redirectUri,
    },
    update: {
      clientId: encryptToken(credentials.clientId),
      clientSecret: encryptToken(credentials.clientSecret),
      appRedirectUri: redirectUri,
    },
  });

  return credentials;
}

/**
 * 保存済みアプリ資格情報を破棄する。
 * インスタンス側でアプリが削除された等で invalid_client になった場合に呼び、
 * 次回ログインで再登録させる。
 */
export async function clearMastodonAppCredentials(domain: string): Promise<void> {
  await prisma.instance.updateMany({
    where: { domain },
    data: { clientId: null, clientSecret: null, appRedirectUri: null },
  });
}
