/**
 * 直接enqueue検証スクリプト（worker のドレイン確認用）
 *
 * producer（email-generate の HMAC 署名 / 定期ジョブの実Botトークン取得）を迂回して、
 * worker タスク（process-mention / process-email）に直接ジョブを積む。
 *
 * 使い方:
 *   1) 別ターミナルで worker を起動: RUN_WORKER=true npm run dev
 *   2) ジョブを積む:
 *
 *   # bot（メンション）経路: 画像はURL参照（worker が fetch する）
 *   npx tsx scripts/enqueue-test.ts mention \
 *     --acct alice --image https://example.com/photo.jpg \
 *     --text "やあ" --options "上 赤 大"
 *
 *   # mail 経路: ローカル画像を R2 一時領域へアップロードしてから積む
 *   npx tsx scripts/enqueue-test.ts email \
 *     --user <userId> --file ./sample.jpg \
 *     --text "やあ" --position top --color red --size large
 *
 * 注意:
 *   - --acct / --user はローカルDBに存在する登録ユーザーを指す必要がある。
 *   - 実投稿を避けたい場合は、対象ユーザーの defaultVisibility を "local" にしておく
 *     （local は Fediverse 投稿をスキップする）。それ以外は実際に投稿される。
 *   - 必要な env: DATABASE_URL（mention/email 共通）, S3/R2 一式（publishImage の保存と email の元画像）。
 *     .env.local → .env の順で読み込む。
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { enqueueMention, enqueueEmail } from "@/lib/queue";
import { uploadImage } from "@/lib/storage/storage";
import type { MastodonNotification } from "@/lib/mention/fetcher";
import type { Position, FontFamily, Color, Size, Arrangement } from "@/types";

// --- 簡易引数パーサ: `mode --k v --k v ...` ---
const [, , mode, ...rest] = process.argv;
const args: Record<string, string> = {};
for (let i = 0; i < rest.length; i += 2) {
  const key = rest[i]?.replace(/^--/, "");
  if (key) args[key] = rest[i + 1] ?? "";
}

const botAcct = process.env.MASTODON_BOT_ACCT || "movapic";

function buildContent(text: string, options?: string): string {
  const opt = options ? `[${options}] ` : "";
  return `<p>@${botAcct} ${opt}${text}</p>`;
}

async function runMention(): Promise<void> {
  const acct = args.acct;
  const image = args.image;
  if (!acct || !image) {
    throw new Error("mention には --acct と --image が必須です");
  }
  const text = args.text ?? "テスト投稿";
  const id = `test-${Date.now()}`;

  const VALID_VISIBILITY = ["public", "unlisted", "private", "direct"] as const;
  const visibility = (
    VALID_VISIBILITY.includes(args.visibility as (typeof VALID_VISIBILITY)[number])
      ? args.visibility
      : "unlisted"
  ) as (typeof VALID_VISIBILITY)[number];

  const notification: MastodonNotification = {
    id,
    type: "mention",
    created_at: new Date().toISOString(),
    account: {
      id: "test-account",
      acct,
      username: acct.split("@")[0],
      display_name: acct,
      avatar: "",
    },
    status: {
      id,
      uri: `https://example.invalid/users/${acct.split("@")[0]}/statuses/${id}`,
      content: buildContent(text, args.options),
      visibility,
      media_attachments: [
        {
          id: "m1",
          type: "image",
          url: image,
          preview_url: image,
          description: null,
        },
      ],
      account: {
        id: "test-account",
        acct,
        username: acct.split("@")[0],
        display_name: acct,
        avatar: "",
      },
      in_reply_to_id: null,
      created_at: new Date().toISOString(),
    },
  };

  await enqueueMention({ notification });
  console.log(`✅ enqueued process-mention  id=${id}  acct=${acct}  image=${image}`);
}

async function runEmail(): Promise<void> {
  const userId = args.user;
  const file = args.file;
  if (!userId || !file) {
    throw new Error("email には --user と --file が必須です");
  }

  const buf = await readFile(file);
  const ext = (file.split(".").pop() || "jpg").toLowerCase();
  const contentType =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "heic" || ext === "heif"
          ? "image/heic"
          : "image/jpeg";

  // producer と同じく R2 一時領域へ元画像を置く
  const sourceStorageKey = `tmp/email/test-${randomUUID()}.${ext}`;
  await uploadImage(buf, sourceStorageKey, contentType);

  await enqueueEmail({
    userId,
    text: args.text ?? "テスト投稿",
    options: {
      position: (args.position as Position) ?? "top",
      font: (args.font as FontFamily) ?? "hui-font",
      color: (args.color as Color) ?? "white",
      size: (args.size as Size) ?? "medium",
      arrangement: (args.arrangement as Arrangement) ?? "none",
      season: (args.season as string) ?? null,
      visibility: "public",
      cameraOption: "none",
      locationOption: "none",
    },
    sourceStorageKey,
    sourceContentType: contentType,
  });
  console.log(`✅ enqueued process-email  userId=${userId}  source=${sourceStorageKey}`);
}

async function main(): Promise<void> {
  if (mode === "mention") {
    await runMention();
  } else if (mode === "email") {
    await runEmail();
  } else {
    console.error(
      "usage: npx tsx scripts/enqueue-test.ts <mention|email> [--flags]\n" +
        "  mention --acct <acct> --image <url> [--text ..] [--options \"上 赤 大\"] [--visibility unlisted]\n" +
        "  email   --user <userId> --file <path> [--text ..] [--position top] [--color red] [--size large] [--font hui-font]"
    );
    process.exit(1);
  }
  // WorkerUtils が開いた pg プールを残したままなので明示終了する
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ enqueue failed:", err);
  process.exit(1);
});
