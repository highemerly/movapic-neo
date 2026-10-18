/**
 * Mastodon アプリ登録（動的クライアント登録）のインスタンス単位での再利用。
 *
 * 従来はログイン開始のたびに POST /api/v1/apps で新規アプリを登録していたため、
 * ユーザーの「認証済みアプリ」一覧にログイン回数ぶん SHAMEZO が並んでしまっていた。
 * 登録済みの client_id/secret を Instance に暗号化保存して使い回すことで、
 * 再ログインは「同一アプリの再認可」になり一覧には1件だけ表示される。
 */

import prisma from "@/lib/db";
import {
  registerMastodonApp,
  revokeMastodonToken,
  type MastodonAppCredentials,
} from "@/lib/auth/fediverse";
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

/**
 * 退会時に、本人の Mastodon アクセストークンを連携先サーバーで失効させる（ユーザー削除の前に呼ぶ）。
 * 失効させないと、SHAMEZO から消えたあとも相手サーバーの「認証済みアプリ」にトークンが生き続ける。
 * 失効には保存済みのアプリ資格情報が要る（トークンを発行したアプリでないと受け付けられない）。
 * Misskey には第三者アプリのトークンを失効させる API が無いので対象外。
 *
 * @returns 失効させた=true / 対象外（Misskey・資格情報なし）=false。通信やサーバーの失敗は throw する
 *          （呼び出し側は失敗しても退会を続ける）。
 */
export async function revokeUserMastodonToken(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      accessToken: true,
      instance: { select: { type: true, domain: true, clientId: true, clientSecret: true } },
    },
  });
  if (!user || user.instance.type !== "mastodon") return false;
  const { domain, clientId, clientSecret } = user.instance;
  if (!clientId || !clientSecret) return false;

  await revokeMastodonToken(
    domain,
    decryptToken(clientId),
    decryptToken(clientSecret),
    decryptToken(user.accessToken)
  );
  return true;
}
