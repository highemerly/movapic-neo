/**
 * Cloudflare Email Worker
 * メールのraw dataをそのままNext.js APIへ転送する軽量Worker
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

export default {
  async email(message: EmailMessage, env: Env): Promise<void> {
    try {
      // メールのraw dataを取得
      const rawEmail = await new Response(message.raw).arrayBuffer();

      // 宛先からemailPrefixを抽出
      const toAddress = message.to;
      const emailPrefix = toAddress.split("@")[0];

      // Next.js APIへ転送
      const response = await fetch(`${env.API_URL}/api/v1/email-generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-API-Key": env.INTERNAL_API_KEY,
          "X-Email-From": message.from,
          "X-Email-To": message.to,
          "X-Email-Prefix": emailPrefix,
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
