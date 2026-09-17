/**
 * dev用: 穴埋めポイント制の手動テスト用シナリオを、ローカルDBに作り直す。冪等（何度でも回せる）。
 *
 * 前提:
 * - **ローカルDB専用**（DATABASE_URL のホストが localhost / 127.0.0.1 でなければ中止）。
 * - 今月がポイント制の月であること。開発時は .env.local に
 *     NEXT_PUBLIC_MAKEUP_POINT_START_YM=YYYY-MM（今月）
 *   を入れて開始月を前倒しする（dev サーバーは再起動。NEXT_PUBLIC_ はビルド時に埋め込まれるため）。
 *   時計は本物のまま使う（makeupPointStartYm のコメント参照）。
 * - JST の今日が10日以降であること（シナリオが「3日の穴」「8日のダブル投稿」などを前提にするため）。
 * - 対象ユーザーの今月・先月に実投稿が無いこと（ダミーと混ざるとシナリオが崩れるので中止する）。
 *
 * やること:
 *  1. リセット: このスクリプトのダミー投稿を全削除し、今月・先月の穴埋めポイント台帳・穴埋め系の通知・
 *     皆勤賞（実績と通知）を消す。
 *  2. シナリオに応じて、先月・今月（昨日まで）のダミー投稿・穴埋め割当・台帳・実績を作る。今日の投稿は作らない。
 *  3. 確認手順を出力する。
 *
 * ダミー投稿は既存の実画像を流用し、storageKey と thumbnailKey の両方に "#dev-makeup-…" を付ける。
 * '#' 以降は URL のフラグメントなので表示は実画像になり、アプリから削除しても S3 の削除対象は
 * 存在しないキーになる（pitfall: thumbnailKey に実キーをそのまま入れると、ダミーの削除で実画像の
 * サムネが消える）。
 *
 * シナリオ（SCENARIO）:
 *   no-points     今月3日が穴・ポイント0（付与も来ない状態）。特典サーバー以外のアカウントで使う
 *   grant-ready   今月3日が穴・8日にダブル投稿（未割当）・先月は皆勤でない・ポイント0 → 定期ジョブで付与
 *   post-flow     今月3日が穴・1pt。今日アプリから投稿して通知を確認する
 *   cap           今月3日と5日が穴・8日と9日にダブル投稿・1pt。上限と付け替えを確認する
 *   delete        今月3日を8日のダブル投稿で穴埋め済み・1pt。8日の写真を1枚削除する
 *   deadline      先月3日が穴・8日にダブル投稿（未割当）。先月は締切を過ぎている
 *   catchup-perfect 先月は8日のダブル投稿で3日を穴埋め済み＝データ上は皆勤だが、皆勤賞の記録が無い
 *   clean         リセットだけして終了
 *
 * 使い方:
 *   SEED_USER=dev02 SEED_DOMAIN=handon.club SCENARIO=grant-ready npx tsx scripts/dev-makeup-points.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { daysInMonthOf, perfectMonthKey, PERFECT_MONTH_CATEGORY } from "@/lib/achievements/perfectMonth";
import { isFavorServer } from "@/lib/auth/serverPolicy";
import { formatYm, jstDayOf, jstMonthRangeOfYm, parseYm, shiftYm, toJstYm } from "@/lib/jst";
import { MAKEUP_NOTIFICATION_TYPES } from "@/lib/makeup/notificationTypes";
import { isPointEra, makeupPointStartYm } from "@/lib/makeup/points";

const SCENARIOS = [
  "no-points",
  "grant-ready",
  "post-flow",
  "cap",
  "delete",
  "deadline",
  "catchup-perfect",
  "clean",
] as const;
type Scenario = (typeof SCENARIOS)[number];

const USERNAME = process.env.SEED_USER;
const DOMAIN = process.env.SEED_DOMAIN;
const SCENARIO = process.env.SCENARIO as Scenario | undefined;
/** このスクリプトのダミー識別マーカー（dev-perfect-month.ts の "#dev-dummy-" とは別）。 */
const MARK = "#dev-makeup-";
/** シナリオで入れる dev 用ポイントの理由（リセットで消す）。 */
const DEV_POINT_REASON = "event:dev-seed";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

/** その月の1か月ぶんの形。holes は投稿しない日、doubles は2枚投稿する日、assign は donor 日→埋める穴の日。 */
interface MonthShape {
  holes?: number[];
  doubles?: number[];
  assign?: Record<number, number>;
}

interface ScenarioSpec {
  current: MonthShape;
  last: MonthShape;
  /** 今月に入れる dev 用ポイント。 */
  points?: number;
  /** 先月の皆勤賞の記録を作る（catchup の対象外にする）。 */
  lastMonthPerfectRecord?: boolean;
  /** 特典サーバーのアカウントで使うと付与が来て状態が崩れるシナリオ。 */
  avoidFavor?: boolean;
  steps: string[];
}

const LAST_NOT_PERFECT: MonthShape = { holes: [5, 6, 7, 8] };

function specOf(scenario: Exclude<Scenario, "clean">, curMonth: number, lastMonth: number): ScenarioSpec {
  // 画面の呼び名: 「案内」＝カレンダー上部の折りたたみ（閉: 未投稿◯日 / 残り◯pt）。
  // 「穴埋めポイント」モーダル＝案内を開いて「穴埋めポイント ›」（獲得方法・付与と消費）。
  switch (scenario) {
    case "no-points":
      return {
        current: { holes: [3] },
        last: {},
        lastMonthPerfectRecord: true,
        avoidFavor: true,
        steps: [
          `カレンダー（${curMonth}月）の案内: 「未投稿 1日 / 残り 0pt」`,
          "「穴埋めポイント」モーダル: 付与も消費も無く「この月はまだポイントが付与されていません。」",
          "編集 → 3日をタップ: 「穴埋めポイントが残っていません」と出て、候補をタップしても指定できない",
          "定期ジョブ（npx tsx scripts/run-periodic.ts makeup-points）を回しても何も付与されない（先月は皆勤賞の記録あり・特典サーバー以外）",
        ],
      };
    case "grant-ready":
      return {
        current: { holes: [3], doubles: [8] },
        last: LAST_NOT_PERFECT,
        steps: [
          "付与前の案内: 「未投稿 1日 / 残り 0pt」（ローカルの worker が先に付与していることもある）",
          "npx tsx scripts/run-periodic.ts makeup-points を実行",
          `通知: 「${curMonth}月の穴埋めポイントを1pt獲得しました！（皆勤賞応援プレゼント）」と「穴埋めできるようになりました。カレンダーから今すぐ穴埋めしよう！」`,
          "（特典サーバーのアカウントなら「handon.club 所属特典」の+1pt も付き、残りは 2pt）",
          `通知をタップすると ${curMonth}月のカレンダーが開く`,
          "「穴埋めポイント」モーダル: 付与の行に 皆勤賞応援プレゼント +1pt",
          `編集 → 3日 → 8日の写真で穴埋め: 案内が「未投稿 0日」、残りが1減る。モーダルに「${curMonth}/3の穴埋め −1pt」`,
          "もう一度ジョブを回しても、付与も通知も増えない",
        ],
      };
    case "post-flow":
      return {
        current: { holes: [3] },
        last: LAST_NOT_PERFECT,
        points: 1,
        steps: [
          "案内: 「未投稿 1日 / 残り 1pt」",
          "今日アプリから1枚目を投稿 → 通知「穴埋めできる日があります。今日2枚目を投稿しよう！」",
          "2枚目を投稿 → 通知「穴埋めできるようになりました。カレンダーから今すぐ穴埋めしよう！」",
          "3枚目を投稿 → 同じ通知は増えない（1日1通）",
          `編集 → 3日 → 今日の写真で穴埋め → 「未投稿 0日 / 残り 0pt」・モーダルに「${curMonth}/3の穴埋め −1pt」`,
          "注意: 実際の投稿フローなので連携先サーバーにも投稿される。公開範囲に気をつけること",
        ],
      };
    case "cap":
      return {
        current: { holes: [3, 5], doubles: [8, 9] },
        last: LAST_NOT_PERFECT,
        points: 1,
        steps: [
          "案内: 「未投稿 2日 / 残り 1pt」",
          "編集 → 3日 → 8日の写真で穴埋め: 成功 → 「未投稿 1日 / 残り 0pt」",
          "編集 → 5日: 「穴埋めポイントが残っていません」と出て指定できない",
          "（DevTools などで PATCH を直接送ると 409「穴埋めポイントが足りません…」）",
          "編集 → 3日 → 9日の写真に付け替え: 成功（件数は増えないので 0pt でもできる）",
          "3日の穴埋めを解除 → 「未投稿 2日 / 残り 1pt」に戻り、5日を埋められる",
        ],
      };
    case "delete":
      return {
        current: { holes: [3], doubles: [8], assign: { 8: 3 } },
        last: LAST_NOT_PERFECT,
        points: 1,
        steps: [
          `案内: 「未投稿 0日 / 残り 0pt」・モーダルに「${curMonth}/3の穴埋め −1pt」`,
          "8日の写真（どちらでも）を画像詳細から削除",
          "案内: 「未投稿 1日 / 残り 1pt」に戻り、3日は空きのまま（別の写真で自動的に埋め直されない）・モーダルの消費行が消える",
          "もう1枚の写真を削除しても何も起きない",
        ],
      };
    case "deadline":
      return {
        current: {},
        last: { holes: [3], doubles: [8] },
        steps: [
          `カレンダーを${lastMonth}月に戻す（${lastMonth}月は旧ルールの月なので上部の案内は出ない）`,
          `編集 → 3日: 「${lastMonth}月の穴埋めは…で締め切りました」と出て候補が出ない`,
          "編集 → 8日（投稿のある日）: 代表サムネの変更はできる",
          `${curMonth}月に戻して案内を開き「詳細なルール ›」: 「${curMonth}月分は…まで」と今月の締切が出る`,
        ],
      };
    case "catchup-perfect":
      return {
        current: {},
        last: { holes: [3], doubles: [8], assign: { 8: 3 } },
        steps: [
          `実行前: ${lastMonth}月のカレンダーは全日埋まっているが、👑（皆勤賞）が付いていない`,
          "npx tsx scripts/run-periodic.ts makeup-points を実行",
          `ログに perfect=1。通知に ${lastMonth}月の皆勤賞と、「${curMonth}月の穴埋めポイントを1pt獲得しました！（実績の達成）」が来る`,
          `${curMonth}月の「穴埋めポイント」モーダルに「皆勤賞応援プレゼント」は付かない（先月が皆勤だったので）`,
        ],
      };
  }
}

function assertLocal(): void {
  const url = process.env.DATABASE_URL ?? "";
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`ローカルDB専用です（DATABASE_URL のホストが ${host || "不明"}）。中止します。`);
  }
}

async function main() {
  assertLocal();
  if (!USERNAME || !DOMAIN) throw new Error("SEED_USER と SEED_DOMAIN を指定してください");
  if (!SCENARIO || !SCENARIOS.includes(SCENARIO)) {
    throw new Error(`SCENARIO は ${SCENARIOS.join(" / ")} のいずれか`);
  }

  const now = new Date();
  const curYm = toJstYm(now);
  const lastYm = shiftYm(curYm, -1);
  const today = jstDayOf(now);

  const user = await prisma.user.findFirst({
    where: { username: USERNAME, instance: { domain: DOMAIN } },
    select: { id: true, createdAt: true, instance: { select: { domain: true } } },
  });
  if (!user) throw new Error(`user @${USERNAME}@${DOMAIN} not found`);

  const months = [lastYm, curYm];
  const monthsRange = {
    gte: jstMonthRangeOfYm(lastYm).start,
    lt: jstMonthRangeOfYm(curYm).end,
  };

  // --- 実データ保護 ---
  const realPosts = await prisma.image.count({
    where: { userId: user.id, createdAt: monthsRange, NOT: { storageKey: { contains: "#dev-" } } },
  });
  if (realPosts > 0) {
    throw new Error(
      `@${USERNAME}@${DOMAIN} には ${lastYm}〜${curYm} の実投稿が ${realPosts} 件あります。ダミーと混ざるため中止します（別のアカウントを使ってください）。`
    );
  }

  // --- リセット ---
  const delImages = await prisma.image.deleteMany({
    where: { userId: user.id, storageKey: { contains: MARK } },
  });
  const delGrants = await prisma.makeupPointGrant.deleteMany({
    where: { userId: user.id, month: { in: months } },
  });
  const perfectKeys = months.map(perfectMonthKey);
  const delNotifications = await prisma.notification.deleteMany({
    where: {
      userId: user.id,
      OR: [
        { type: { in: Object.values(MAKEUP_NOTIFICATION_TYPES) } },
        { type: "achievement", achievementKey: { in: perfectKeys } },
      ],
    },
  });
  const delAchievements = await prisma.achievement.deleteMany({
    where: { userId: user.id, key: { in: perfectKeys } },
  });
  console.log(
    `リセット: ダミー投稿 ${delImages.count} / 台帳 ${delGrants.count} / 通知 ${delNotifications.count} / 皆勤賞 ${delAchievements.count}`
  );
  if (SCENARIO === "clean") return;

  // --- 前提チェック ---
  if (!isPointEra(curYm)) {
    throw new Error(
      `今月（${curYm}）がポイント制の月ではありません（開始月 ${makeupPointStartYm()}）。` +
        `.env.local に NEXT_PUBLIC_MAKEUP_POINT_START_YM=${curYm} を入れてください。`
    );
  }
  if (today < 10) throw new Error(`JST の今日（${today}日）が10日以降のときに使ってください`);

  const spec = specOf(SCENARIO, parseYm(curYm).month, parseYm(lastYm).month);
  if (spec.avoidFavor && isFavorServer(user.instance.domain)) {
    console.warn(
      `⚠️ ${user.instance.domain} は特典サーバーなので、定期ジョブで毎月の+1pt が付いて「ポイント0」の状態が崩れます。特典サーバー以外のアカウントを推奨します。`
    );
  }
  if (user.createdAt >= jstMonthRangeOfYm(curYm).start) {
    console.warn("⚠️ このアカウントは今月の登録なので、monthly-catchup の対象になりません。");
  }

  // --- ダミー投稿 ---
  const imagePool = await prisma.image.findMany({
    where: {
      thumbnailKey: { not: null },
      isDisabled: false,
      NOT: { storageKey: { contains: "#" } },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { storageKey: true, thumbnailKey: true, width: true, height: true },
  });
  if (imagePool.length === 0) throw new Error("流用できる実画像がありません（サムネ付きの投稿を1枚以上用意してください）");
  let poolIdx = 0;

  const createPost = (ym: string, day: number, seq: number, makeupTargetDay: number | null) => {
    const src = imagePool[poolIdx++ % imagePool.length];
    const { year, month } = parseYm(ym);
    const tag = `${MARK}${ym}-${String(day).padStart(2, "0")}-${seq}-${randomUUID()}`;
    return prisma.image.create({
      data: {
        userId: user.id,
        storageKey: `${src.storageKey}${tag}`,
        // サムネにもマーカーを付ける（ダミーの削除で実画像のサムネを消さないため）
        thumbnailKey: `${src.thumbnailKey}${tag}`,
        filename: `dev-makeup-${ym}-${day}.jpg`,
        mimeType: "image/jpeg",
        fileSize: 123456,
        width: src.width ?? 800,
        height: src.height ?? 600,
        overlayText: `穴埋めテスト ${month}/${day}`,
        position: "bottom",
        font: "hui-font",
        color: "white",
        size: "medium",
        outputFormat: "none",
        source: "web",
        isPublic: true,
        // JST 12:0seq（同じ日の中で1枚目・2枚目の順序をつける）
        createdAt: new Date(Date.UTC(year, month - 1, day, 3, seq, 0)),
        makeupTargetDay,
      },
    });
  };

  const seedMonth = async (ym: string, shape: MonthShape, lastDay: number) => {
    const holes = new Set(shape.holes ?? []);
    const doubles = new Set(shape.doubles ?? []);
    let count = 0;
    for (let day = 1; day <= lastDay; day++) {
      if (holes.has(day)) continue;
      await createPost(ym, day, 1, null);
      count++;
      if (doubles.has(day)) {
        await createPost(ym, day, 2, shape.assign?.[day] ?? null);
        count++;
      }
    }
    return count;
  };

  const { year: ly, month: lm } = parseYm(lastYm);
  const lastCount = await seedMonth(lastYm, spec.last, daysInMonthOf(ly, lm));
  // 今月は昨日まで（今日の投稿はアプリから行う）
  const curCount = await seedMonth(curYm, spec.current, today - 1);

  if (spec.lastMonthPerfectRecord) {
    const latest = await prisma.image.findFirst({
      where: { userId: user.id, createdAt: { gte: jstMonthRangeOfYm(lastYm).start, lt: jstMonthRangeOfYm(lastYm).end } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    await prisma.achievement.create({
      data: {
        userId: user.id,
        key: perfectMonthKey(lastYm),
        category: PERFECT_MONTH_CATEGORY,
        imageId: latest?.id ?? null,
      },
    });
  }

  if (spec.points) {
    await prisma.makeupPointGrant.create({
      data: { userId: user.id, month: curYm, reason: DEV_POINT_REASON, amount: spec.points },
    });
  }

  const { year: cy, month: cm } = parseYm(curYm);
  console.log("──────────────────────────────────────");
  console.log(`@${USERNAME}@${DOMAIN} / シナリオ: ${SCENARIO}  （開始月 ${makeupPointStartYm()}・今日 ${curYm}-${String(today).padStart(2, "0")}）`);
  console.log(`ダミー投稿: 先月 ${lastCount} 件 / 今月 ${curCount} 件（今日の分は無し）`);
  console.log(`今月の穴: ${JSON.stringify(spec.current.holes ?? [])} / ダブル投稿: ${JSON.stringify(spec.current.doubles ?? [])}`);
  console.log(`先月の穴: ${JSON.stringify(spec.last.holes ?? [])} / ダブル投稿: ${JSON.stringify(spec.last.doubles ?? [])}`);
  console.log(`dev 用ポイント: ${spec.points ?? 0}pt${spec.lastMonthPerfectRecord ? " / 先月の皆勤賞の記録あり" : ""}`);
  console.log("──────────────────────────────────────");
  console.log(`カレンダー: /u/${USERNAME}@${DOMAIN}/calendar?year=${cy}&month=${cm}（このアカウントでログインして開く）`);
  console.log("確認すること:");
  spec.steps.forEach((s, i) => console.log(`  ${i + 1}) ${s}`));
  console.log(`後片付け: SEED_USER=${USERNAME} SEED_DOMAIN=${DOMAIN} SCENARIO=clean npx tsx scripts/dev-makeup-points.ts`);
  console.log(`（定期ジョブが付けた ${formatYm(cy, cm)} の付与もリセットで消える）`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
