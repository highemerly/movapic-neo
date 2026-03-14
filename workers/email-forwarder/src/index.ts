/**
 * Cloudflare Email Worker
 * メールのraw dataをそのままNext.js APIへ転送する軽量Worker
 *
 * Note: このファイルはCloudflare Workers環境で実行されます。
 * ビルド・デプロイ時は workers/email-forwarder/tsconfig.json が使用され、
 * @cloudflare/workers-types により正しく型チェックされます。
 */

export interface Env {
  API_URL: string;
  INTERNAL_API_KEY: string;
}

export interface EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
}

/**
 * SHA-256ハッシュを計算
 */
async function sha256(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * HMAC-SHA256署名を生成
 */
async function generateSignature(
  timestamp: number,
  bodyHash: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const data = `${timestamp}:${bodyHash}`;
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  return signatureArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const emailWorker = {
  async email(message: EmailMessage, env: Env): Promise<void> {
    try {
      // メールのraw dataを取得
      const rawEmail = await new Response(message.raw).arrayBuffer();

      // 宛先からemailPrefixを抽出
      const toAddress = message.to;
      const emailPrefix = toAddress.split("@")[0];

      // リクエスト署名を生成
      const timestamp = Date.now();
      const bodyHash = await sha256(rawEmail);
      const signature = await generateSignature(timestamp, bodyHash, env.INTERNAL_API_KEY);

      // Next.js APIへ転送
      const response = await fetch(`${env.API_URL}/api/v1/email-generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-API-Key": env.INTERNAL_API_KEY,
          "X-Email-From": message.from,
          "X-Email-To": message.to,
          "X-Email-Prefix": emailPrefix,
          "X-Request-Timestamp": timestamp.toString(),
          "X-Request-Signature": signature,
        },
        body: rawEmail,
      });

      if (!response.ok) {
        console.error(
          `Failed to process email: ${response.status} ${await response.text()}`
        );
      }
    } catch (error) {
      console.error("Email processing error:", error);
    }
  },
};

export default emailWorker;
