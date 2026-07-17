/**
 * dev用: 「③OFF ユーザーが手動穴埋めで皆勤成立 → 別画面へ離脱 → 👑付与」を
 * 手早く検証するためのセットアップ／リセット。冪等（何度でも回せる）。
 *
 * ⚠️ 実データを汚さないため、既定では「実投稿が1件も無い過去月」にダミーを撒く。
 *    対象月に実投稿（ダミー以外）があれば中止する。テストは実アカウントのまま、
 *    使っていない過去月（例: 2020年1月）を開いて行う。👑通知は実アカウントに届く。
 *
 * ダミーの見た目: ダミー画像は「ユーザー本人の実画像」を1枚ずつ流用して作るので、
 *   カレンダーのサムネも画像詳細ページの本画像も実物が表示される（＝本当に投稿したように見える）。
 *   仕組み: storageKey は一意制約があるため実パスをそのまま使えない。そこで
 *   「実パス + '#dev-dummy-…'」にする。'#' 以降は URL のフラグメントでサーバーに送られないため
 *   ブラウザは実オブジェクトを取得しつつ、DB 上は一意＆ダミーとして検出できる（アプリの URL 構築は
 *   `${publicUrl}/${storageKey}` の生連結なので '#' がそのままフラグメントになる）。
 *
 * やること（対象ユーザー・対象月に対して）:
 *  1. autoMakeup=false にする（＝③OFF。reevaluate が実際に効くのはこのケースだけ）。
 *  2. その月に「1日だけ穴が空いた・後日ダブル投稿で埋められる」ダミー投稿を作る。
 *     DONOR_DAY は実際に2枚（別々の実画像）投稿されているように見せる。
 *  3. perfect-month:YYYY-MM の実績と通知を削除（＝未付与へ戻す）。何度でもリトライ検証できる。
 *  4. 現在の判定（isPerfectMonth）と実績の有無、検証URL・手順を出力。
 *
 * モード:
 *  - 既定: 穴を埋めた状態（makeupTargetDay 設定済み）。カレンダーを開き「編集ON → 離脱」だけで👑。
 *  - UNFILL=1: 穴を未充填で用意。アプリの穴埋めピッカーで手動で埋めてから離脱する実運用フロー用。
 *  - CLEAN=1: ダミー投稿を全削除し、テスト由来の皆勤賞・通知も剥奪して終了（後片付け）。
 *            剥奪対象は「実投稿の無い月（ダミー専用のテスト月）」のみ＝正規の👑は守る。
 *
 * 使い方:
 *   DATABASE_URL="..." npx tsx scripts/dev-perfect-month.ts                    # 既定(2020年1月)に用意
 *   DATABASE_URL="..." SEED_YEAR=2019 SEED_MONTH=3 npx tsx scripts/dev-perfect-month.ts
 *   DATABASE_URL="..." UNFILL=1 npx tsx scripts/dev-perfect-month.ts           # 手動穴埋めフロー用
 *   DATABASE_URL="..." CLEAN=1 npx tsx scripts/dev-perfect-month.ts            # ダミー全削除
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { toJstDateString } from "@/lib/streak";
import {
  daysInMonthOf,
  isPerfectMonth,
  perfectMonthKey,
  PERFECT_MONTH_CATEGORY,
} from "@/lib/achievements/perfectMonth";
import { perfectMonthGrace } from "@/lib/achievements/grace";

const USERNAME = process.env.SEED_USER ?? "highemerly";
// 同名ユーザーが複数インスタンスに存在するため、必ず domain で一意に絞る（ログイン中アカウントと一致させる）。
const DOMAIN = process.env.SEED_DOMAIN ?? "handon.club";
const YEAR = Number(process.env.SEED_YEAR ?? 2020);
const MONTH = Number(process.env.SEED_MONTH ?? 1);
const HOLE_DAY = 5; // 投稿を忘れた日（穴）
const DONOR_DAY = 10; // 後日のダブル投稿（HOLE_DAY より後＝穴を埋められる）
const UNFILL = process.env.UNFILL === "1";
const CLEAN = process.env.CLEAN === "1";
/** ダミー識別マーカー（storageKey の '#' 以降。URL フラグメント＝サーバーには送られない）。 */
const DUMMY_MARK = "#dev-dummy-";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const mm = String(MONTH).padStart(2, "0");
/** JST 正午台の Date（seq 分ずらして同日内で時刻を分ける。toJstDateString が "YYYY-MM-DD"）。 */
const at = (day: number, seq: number) => new Date(Date.UTC(YEAR, MONTH - 1, day, 3, seq, 0));
const monthStart = new Date(Date.UTC(YEAR, MONTH - 1, 1, -9, 0, 0));
const monthEnd = new Date(Date.UTC(YEAR, MONTH, 1, -9, 0, 0));

async function main() {
  const user = await prisma.user.findFirst({
    where: { username: USERNAME, instance: { domain: DOMAIN } },
    select: { id: true, autoMakeup: true, instance: { select: { domain: true } } },
  });
  if (!user) throw new Error(`user @${USERNAME}@${DOMAIN} not found`);

  // CLEAN: このユーザーのダミーを全撤去し、テスト由来の皆勤賞・通知も剥奪して終了。
  // 正規の👑を守るため、剥奪対象は「実投稿が1件も無い月（＝ダミー専用のテスト月）」の
  // perfect-month のみ。実投稿のある月の皆勤賞・通知は一切触らない。
  if (CLEAN) {
    const reals = await prisma.image.findMany({
      where: { userId: user.id, NOT: { storageKey: { contains: DUMMY_MARK } } },
      select: { createdAt: true },
    });
    const realMonths = new Set(reals.map((r) => toJstDateString(r.createdAt).slice(0, 7)));

    const del = await prisma.image.deleteMany({
      where: { userId: user.id, storageKey: { contains: DUMMY_MARK } },
    });

    const perfectAch = await prisma.achievement.findMany({
      where: { userId: user.id, category: PERFECT_MONTH_CATEGORY },
      select: { key: true },
    });
    const testKeys = perfectAch
      .map((a) => a.key)
      .filter((k) => !realMonths.has(k.split(":")[1] ?? ""));
    if (testKeys.length > 0) {
      await prisma.notification.deleteMany({
        where: { userId: user.id, achievementKey: { in: testKeys } },
      });
      await prisma.achievement.deleteMany({ where: { userId: user.id, key: { in: testKeys } } });
    }

    console.log(
      `CLEAN: @${USERNAME} のダミー投稿 ${del.count} 件 / テスト由来の皆勤賞・通知 ${testKeys.length} 件（${testKeys.join(", ") || "なし"}）を削除。`,
    );
    console.log(`保持した正規の投稿月: ${[...realMonths].sort().join(", ") || "なし"}`);
    return;
  }

  // 実データ保護: 対象月に「ダミー以外」の投稿があれば中止（混ざると検証にならない）
  const realInMonth = await prisma.image.count({
    where: {
      userId: user.id,
      createdAt: { gte: monthStart, lt: monthEnd },
      NOT: { storageKey: { contains: DUMMY_MARK } },
    },
  });
  if (realInMonth > 0) {
    const reals = await prisma.image.findMany({
      where: { userId: user.id, NOT: { storageKey: { contains: DUMMY_MARK } } },
      select: { createdAt: true },
    });
    const occupied = new Set(reals.map((r) => toJstDateString(r.createdAt).slice(0, 7)));
    console.error("──────────────────────────────────────");
    console.error(`⚠️ 中止: ${YEAR}年${MONTH}月 には実投稿が ${realInMonth} 件あります。`);
    console.error("実データを汚さないため、実投稿の無い過去月を指定してください:");
    console.error(`  SEED_YEAR=YYYY SEED_MONTH=M npx tsx scripts/dev-perfect-month.ts`);
    console.error(`実投稿のある月（避けるべき）: ${[...occupied].sort().join(", ")}`);
    console.error("──────────────────────────────────────");
    process.exitCode = 1;
    return;
  }

  const key = perfectMonthKey(`${YEAR}-${mm}`);
  const daysInMonth = daysInMonthOf(YEAR, MONTH);
  const grace = perfectMonthGrace(user.instance.domain);

  // 見た目を実物にするための実画像プール（本人の公開画像・サムネあり）。1枚ずつ循環で流用する。
  const realPool = await prisma.image.findMany({
    where: {
      userId: user.id,
      isPublic: true,
      isDisabled: false,
      thumbnailKey: { not: null },
      NOT: { storageKey: { contains: DUMMY_MARK } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { storageKey: true, thumbnailKey: true, width: true, height: true, position: true },
  });
  if (realPool.length === 0) {
    throw new Error(
      "流用できる実画像がありません（公開・サムネあり）。先に何枚か投稿してから実行してください。",
    );
  }
  let poolIdx = 0;
  const nextSrc = () => realPool[poolIdx++ % realPool.length];

  // 1) ③OFF に
  await prisma.user.update({ where: { id: user.id }, data: { autoMakeup: false } });

  // 2) この月のダミーを作り直す
  await prisma.image.deleteMany({
    where: { userId: user.id, storageKey: { contains: `${DUMMY_MARK}${YEAR}-${mm}-` } },
  });

  const create = (day: number, seq: number, makeupTargetDay: number | null) => {
    const src = nextSrc(); // 実画像を1枚流用（サムネ＝実物・詳細の本画像＝実物）
    return prisma.image.create({
      data: {
        userId: user.id,
        // 実パス + '#dev-dummy-YYYY-MM-DD-seq-uuid'。'#' 以降はURLフラグメントなので実オブジェクトを取得。
        storageKey: `${src.storageKey}${DUMMY_MARK}${YEAR}-${mm}-${String(day).padStart(2, "0")}-${seq}-${randomUUID()}`,
        thumbnailKey: src.thumbnailKey,
        filename: `dummy-${mm}${String(day).padStart(2, "0")}.jpg`,
        mimeType: "image/jpeg",
        fileSize: 123456,
        width: src.width ?? 800,
        height: src.height ?? 600,
        overlayText: `テスト投稿 ${MONTH}/${day}`,
        position: src.position ?? "top",
        font: "hui-font",
        color: "white",
        size: "medium",
        outputFormat: "none",
        source: "web",
        isPublic: true,
        createdAt: at(day, seq),
        makeupTargetDay,
      },
    });
  };

  // HOLE_DAY 以外は毎日1枚。DONOR_DAY だけ2枚（別々の実画像＝本物のダブル投稿に見える）。
  for (let day = 1; day <= daysInMonth; day++) {
    if (day === HOLE_DAY) continue;
    await create(day, 1, null);
    if (day === DONOR_DAY) {
      await create(day, 2, UNFILL ? null : HOLE_DAY); // 既定は穴を埋めた状態で用意
    }
  }

  // 3) 実績・通知を未付与へリセット（何度でも検証できるように）
  await prisma.notification.deleteMany({ where: { userId: user.id, achievementKey: key } });
  await prisma.achievement.deleteMany({ where: { userId: user.id, key } });

  // 4) 現状の判定を表示
  const rows = await prisma.image.findMany({
    where: { userId: user.id, createdAt: { gte: monthStart, lt: monthEnd } },
    select: { createdAt: true, makeupTargetDay: true },
  });
  const dayCounts: Record<number, number> = {};
  for (const r of rows) {
    const d = Number(toJstDateString(r.createdAt).slice(8, 10));
    dayCounts[d] = (dayCounts[d] ?? 0) + 1;
  }
  const filledHoleDays = rows
    .map((r) => r.makeupTargetDay)
    .filter((v): v is number => v != null && (dayCounts[v] ?? 0) === 0);
  const perfect = isPerfectMonth({ daysInMonth, dayCounts, filledHoleDays, grace });
  const owned = await prisma.achievement.findFirst({ where: { userId: user.id, key } });
  const distinctDays = Object.keys(dayCounts).length;

  console.log("──────────────────────────────────────");
  console.log(`@${USERNAME}@${DOMAIN} / ${YEAR}年${MONTH}月  category=${PERFECT_MONTH_CATEGORY}`);
  console.log(`autoMakeup=false（③OFF）grace=${grace} 穴=${HOLE_DAY}日 donor=${DONOR_DAY}日（別々の実画像2枚）`);
  console.log(`モード: ${UNFILL ? "UNFILL（アプリ上で手動穴埋めする）" : "既定（穴埋め済み・離脱するだけで👑）"}`);
  console.log(`投稿=${distinctDays}日 / 穴=${HOLE_DAY}日 / filled=${JSON.stringify(filledHoleDays)} → isPerfectMonth=${perfect}`);
  console.log(`実績付与済み = ${owned ? "あり（リセット漏れ？）" : "なし（未付与＝これから離脱で付く）"}`);
  console.log("──────────────────────────────────────");
  console.log("検証手順:");
  console.log(`  1) /u/${USERNAME}/calendar?year=${YEAR}&month=${MONTH} を owner で開く`);
  console.log("  2) DevTools → Network を開き 'reevaluate' でフィルタ");
  console.log("  3) 『カレンダーを編集』をON");
  if (UNFILL) console.log(`     → ${HOLE_DAY}日をタップし、穴埋めピッカーで ${DONOR_DAY}日の写真を選ぶ`);
  console.log("  4) 次のいずれかで離脱 → 毎回 reevaluate リクエストが飛ぶこと:");
  console.log("     - ヘッダーロゴ/下部ナビ/メニュー/戻る（＝アプリ内遷移・アンマウント）");
  console.log("     - タブ切替やバックグラウンド化（＝visibilitychange）");
  console.log("     - リロード/タブを閉じる（＝pagehide）");
  console.log("  5) ベル通知に『皆勤賞』が付く（＝reevaluate が付与）。再検証は本スクリプトを再実行。");
  console.log("  後片付け: CLEAN=1 npx tsx scripts/dev-perfect-month.ts");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
