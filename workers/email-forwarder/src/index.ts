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

/**
 * メールヘッダから接続元IPをベストエフォートで抽出する。
 * Cloudflareが付与する Authentication-Results / Received-SPF の client-ip を優先し、
 * 無ければ Received ヘッダ内の [IP] / (IP) を拾う。取れなければ "unknown"。
 */
function extractClientIp(headers: Headers): string {
  const candidates = [
    headers.get("authentication-results"),
    headers.get("received-spf"),
    headers.get("received"),
  ];
  for (const h of candidates) {
    if (!h) continue;
    const match =
      h.match(/client-ip=([0-9a-fA-F:.]+)/i) ||
      h.match(/[[(]([0-9]{1,3}(?:\.[0-9]{1,3}){3})[\])]/) ||
      h.match(/[[(]([0-9a-fA-F:]*:[0-9a-fA-F:]+)[\])]/);
    if (match) return match[1];
  }
  return "unknown";
}

const emailWorker = {
  async email(message: EmailMessage, env: Env): Promise<void> {
    try {
      // メールのraw dataを取得
      const rawEmail = await new Response(message.raw).arrayBuffer();

      // 宛先からemailPrefixを抽出
      const toAddress = message.to;
      const emailPrefix = toAddress.split("@")[0];

      // 受信ログ（観測用）。リスト型攻撃の発信元IP/Fromを把握するため、
      // prefixの有効・無効に関わらず全受信メールについて記録する。
      console.log(
        JSON.stringify({
          event: "email_received",
          envelopeFrom: message.from,
          fromHeader: message.headers.get("from") ?? "",
          to: message.to,
          emailPrefix,
          clientIp: extractClientIp(message.headers),
          rawSize: message.rawSize,
        })
      );

      // リクエスト署名を生成
      const timestamp = Date.now();
      const bodyHash = await sha256(rawEmail);
      const signature = await generateSignature(timestamp, bodyHash, env.INTERNAL_API_KEY);

      // Next.js APIへ転送（正規パス: /api/v1/ingest/email）
      const response = await fetch(`${env.API_URL}/api/v1/ingest/email`, {
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
