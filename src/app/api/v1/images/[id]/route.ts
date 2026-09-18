/**
 * 画像のカレンダー手動制御（PATCH）・削除（DELETE）エンドポイント
 * /api/v1/images/:id
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithValidation } from "@/lib/auth/session";
import { deleteImage } from "@/lib/storage/storage";
import { decryptToken } from "@/lib/auth/tokens";
import { fediverseStatusExists } from "@/lib/fediverse/delete";
import prisma from "@/lib/db";
import { toJstDateString } from "@/lib/streak";
import { daysInMonthOf, isPerfectMonth, perfectMonthKey } from "@/lib/achievements/perfectMonth";
import { perfectMonthGrace } from "@/lib/achievements/grace";
import { recomputeMonthMakeups } from "@/lib/achievements/makeupAssign";
import { jstMonthRangeOfYm, parseYm, shiftYm, toJstYm } from "@/lib/jst";
import { resolveMakeupCap, withMonthMakeupLock } from "@/lib/makeup/ledger";
import {
  DONOR_SAME_MONTH,
  donorDeltaFor,
  donorTargetYm,
  filledHoleOf,
  type DonorRow,
} from "@/lib/makeup/donor";
import {
  MAKEUP_DEADLINE_DAY,
  isMakeupEditable,
  isPointEra,
  makeupDeadline,
} from "@/lib/makeup/points";
import { healAfterImageDelete } from "@/lib/makeup/selfHeal";

/** その画像の JST 日(1-31)。 */
function jstDay(createdAt: Date): number {
  return Number(toJstDateString(createdAt).slice(8, 10));
}

/** 穴埋め割当の変更内容（day=null は解除）。月またぎがあるので対象月のオフセットも持つ。 */
interface MakeupUpdate {
  day: number | null;
  delta: number;
}

/** 検証で読む画像行（穴埋め割当の解決に必要な最小限＋id）。 */
type MakeupRow = DonorRow & { id: string };

/** 締切を過ぎた月の穴埋めを触ろうとしたときの案内。 */
function makeupClosedMessage(ym: string): string {
  const { month } = parseYm(ym);
  const deadlineMonth = parseYm(shiftYm(ym, 1)).month;
  return `${month}月の穴埋めは${deadlineMonth}月${MAKEUP_DEADLINE_DAY}日で締め切りました`;
}

/** 対象月 ym の日(1-31) → 投稿数。その月に投稿された行だけ数える（翌月の donor は数えない）。 */
function dayCountsOf(rows: ReadonlyArray<MakeupRow>, ym: string): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const r of rows) {
    if (!toJstDateString(r.createdAt).startsWith(ym)) continue;
    const d = jstDay(r.createdAt);
    counts[d] = (counts[d] ?? 0) + 1;
  }
  return counts;
}

/**
 * 変更を適用した後に、対象月 ym の穴を埋めている割当の穴の日（実在する空き日のみ・重複なし）。
 * 上限チェックと no-divergence 判定の両方がこれを使う。
 */
function filledHolesAfter(
  rows: ReadonlyArray<MakeupRow>,
  ym: string,
  dayCounts: Record<number, number>,
  updates: ReadonlyMap<string, MakeupUpdate>
): Set<number> {
  const filled = new Set<number>();
  for (const r of rows) {
    const upd = updates.get(r.id);
    const hole = upd
      ? upd.day != null && donorTargetYm(toJstYm(r.createdAt), upd.delta) === ym
        ? upd.day
        : null
      : filledHoleOf(r, ym);
    if (hole != null && (dayCounts[hole] ?? 0) === 0) filled.add(hole);
  }
  return filled;
}

/**
 * PATCH /api/v1/images/:id — カレンダーの手動制御（owner専用）
 * body:
 *  - calendarPicked?: boolean       … ① その日のサムネイルにする / 解除
 *  - makeupTargetDay?: number | null … ② この投稿(donor)が埋める空き日を指定 / 解除
 *
 * 皆勤賞達成済み(👑)の月では「穴埋めの解除（un-assign）」で非達成に落ちる変更を拒否する
 *（＝表示と👑が食い違わない no-divergence 不変条件）。別donorへの付替（穴を保つ）は許可。
 *
 * ② は締切（対象月の翌月10日まで）を過ぎると指定・解除とも拒否する。① は締切と無関係。
 * ② の上限は ledger.resolveMakeupCap（2026-09 以前は所属インスタンスの固定日数・以降は穴埋めポイント）。
 * 検証〜適用はユーザー×月で直列化する（並行リクエストで上限を超えないため。withMonthMakeupLock 参照）。
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserWithValidation();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const image = await prisma.image.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        calendarPickedAt: true,
        makeupTargetDay: true,
        makeupTargetMonthDelta: true,
      },
    });
    if (!image) {
      return NextResponse.json({ error: "画像が見つかりません" }, { status: 404 });
    }
    if (image.userId !== user.id) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const imageJstDate = toJstDateString(image.createdAt);
    const imageYm = imageJstDate.slice(0, 7);

    const wantsPick = typeof body.calendarPicked === "boolean";
    const wantsMakeup = body.makeupTargetDay !== undefined;
    if (!wantsPick && !wantsMakeup) {
      return NextResponse.json({ error: "更新するフィールドがありません" }, { status: 400 });
    }

    // ② の対象月。指定時は body.makeupTargetMonth（省略＝この写真と同じ月）、解除時は今埋めている月。
    // 月またぎ donor（翌月1〜10日の投稿で前月を埋める）があるので、写真の月とは別に持つ必要がある。
    let targetYm = imageYm;
    if (wantsMakeup) {
      if (body.makeupTargetDay === null) {
        targetYm = donorTargetYm(imageYm, image.makeupTargetMonthDelta);
      } else if (body.makeupTargetMonth !== undefined) {
        if (typeof body.makeupTargetMonth !== "string") {
          return NextResponse.json({ error: "穴埋め先の月が不正です" }, { status: 400 });
        }
        targetYm = body.makeupTargetMonth;
      }
    }
    const resolvedDelta = donorDeltaFor(imageYm, targetYm);
    if (wantsMakeup && resolvedDelta === null) {
      return NextResponse.json(
        { error: "この写真はその月の穴埋めには使えません" },
        { status: 409 }
      );
    }
    // pick 専用リクエストでは donor にしないので同月扱いでよい。
    const donorDelta = resolvedDelta ?? DONOR_SAME_MONTH;

    const { year: targetYear, month: targetMonth } = parseYm(targetYm);
    const daysInMonth = daysInMonthOf(targetYear, targetMonth);

    const now = new Date();
    if (wantsMakeup && !isMakeupEditable(targetYm, now)) {
      return NextResponse.json({ error: makeupClosedMessage(targetYm) }, { status: 409 });
    }

    // 検証〜適用をユーザー×月で直列化する。検証で弾いたときは NextResponse を返し（書き込みなし）、
    // 通ったときは null を返す。
    // ロックは「この写真の月」と「その前月」の2つ。月またぎ donor では守る不変条件が2つの月に
    // 分かれる（上限・1穴1donor は対象月 / 1日1donor は写真自身の月）ため、写真の月から到達しうる
    // 月をすべて押さえる。withMonthMakeupLock が昇順で取るのでデッドロックしない。
    const lockYms = wantsMakeup ? [shiftYm(imageYm, -1), imageYm] : [imageYm];
    const rejected = await withMonthMakeupLock(user.id, lockYms, async (tx) => {
      // 検証に要る画像（実績と同じ集合＝isPublic/isDisabledで絞らない）。
      // 範囲は「前月の1日 〜 この写真の月の締切」。月またぎ donor があるので、対象月の投稿だけでなく
      // 前月の投稿と、この写真と同じ日の投稿がすべて1本の範囲に入るようにする。
      const rangeStart = jstMonthRangeOfYm(shiftYm(imageYm, -1)).start;
      const rangeEnd = makeupDeadline(imageYm);
      const rows: MakeupRow[] = await tx.image.findMany({
        where: { userId: user.id, createdAt: { gte: rangeStart, lt: rangeEnd } },
        select: { id: true, createdAt: true, makeupTargetDay: true, makeupTargetMonthDelta: true },
      });
      const dayCounts = dayCountsOf(rows, targetYm);
      // この写真と同じ日の投稿（ダブル投稿判定・1日1代表・1日1donor）。
      // 月をまたぐので日番号ではなく JST 日付そのもので比べる（10/3 と 11/3 を取り違えない）。
      const sameDate = rows.filter((m) => toJstDateString(m.createdAt) === imageJstDate);

      // 実行する DB 更新（imageId -> 変更内容）をまとめてから1トランザクションで適用する。
      const pickUpdates = new Map<string, Date | null>();
      const makeupUpdates = new Map<string, MakeupUpdate>();
      const unassign: MakeupUpdate = { day: null, delta: DONOR_SAME_MONTH };

      // ---- ① 代表（サムネイル）----
      if (wantsPick) {
        if (body.calendarPicked === true) {
          // ①↔②重複: 代表にする画像が donor（穴埋めに使用中）なら不可
          if (image.makeupTargetDay != null) {
            return NextResponse.json(
              { error: "穴埋めに使っている写真は、その日のサムネイルにできません" },
              { status: 409 }
            );
          }
          pickUpdates.set(id, new Date());
          // 1日1代表: 同JST日の他画像の pick を外す
          for (const m of sameDate) {
            if (m.id !== id) pickUpdates.set(m.id, null);
          }
        } else {
          pickUpdates.set(id, null);
        }
      }

      // ---- ② 穴埋め割当（donor）----
      if (wantsMakeup) {
        const target = body.makeupTargetDay;
        if (target === null) {
          makeupUpdates.set(id, unassign);
        } else {
          if (typeof target !== "number" || !Number.isInteger(target) || target < 1 || target > daysInMonth) {
            return NextResponse.json({ error: "穴埋め先の日付が不正です" }, { status: 400 });
          }
          // 合法性: donorは穴より後・穴は空き日・donor日はダブル投稿・代表ではない
          // 「穴より後」は月をまたぐので JST 日付で比べる（11/3 は 10/31 より後）。
          const holeDate = `${targetYm}-${String(target).padStart(2, "0")}`;
          if (imageJstDate <= holeDate) {
            return NextResponse.json(
              { error: "穴埋めは、その日より後のダブル投稿でしか埋められません" },
              { status: 409 }
            );
          }
          if ((dayCounts[target] ?? 0) !== 0) {
            return NextResponse.json({ error: "その日には投稿があるため穴埋めできません" }, { status: 409 });
          }
          if (sameDate.length < 2) {
            return NextResponse.json(
              { error: "1日に2枚以上投稿した日の写真だけが穴埋めに使えます" },
              { status: 409 }
            );
          }
          if (image.calendarPickedAt != null || pickUpdates.get(id) instanceof Date) {
            return NextResponse.json(
              { error: "その日のサムネイルにしている写真は穴埋めに使えません" },
              { status: 409 }
            );
          }
          makeupUpdates.set(id, { day: target, delta: donorDelta });
          // 1日1donor（月またぎ共有）: 同JST日の他の donor を外す。どの月の穴を埋めていても外す
          //（共有しないと1回のダブル投稿で2日ぶん埋まり、1pt で2日得をする）。
          for (const m of sameDate) {
            if (m.id !== id && m.makeupTargetDay != null) makeupUpdates.set(m.id, unassign);
          }
          // 1穴1donor（再割当）: 同じ穴を埋めている別donorを外す＝別donorへ付替
          for (const m of rows) {
            if (m.id !== id && filledHoleOf(m, targetYm) === target) makeupUpdates.set(m.id, unassign);
          }
        }
      }

      // ---- 穴埋めまわりのガード（grace 上限 / 締切 / no-divergence）----
      if (makeupUpdates.size > 0) {
        // 変更が穴埋めに影響する月（＝外す割当の元の月と、新しく埋める月）。1日1donor の月またぎ共有で
        // 「11月の穴を埋めるために、同じ日の写真が埋めていた10月の割当を外す」が起きるため、
        // 対象月だけを見ていると別の月を締切後に変えたり、確定した👑を崩したりしうる。
        // 対象月は指定・解除のどちらでも必ず変わるので最初から入れる。
        const affected = new Set<string>([targetYm]);
        const rowById = new Map(rows.map((m) => [m.id, m]));
        for (const [rowId, upd] of makeupUpdates) {
          const row = rowById.get(rowId);
          if (!row) continue;
          const rowYm = toJstYm(row.createdAt);
          if (row.makeupTargetDay != null) affected.add(donorTargetYm(rowYm, row.makeupTargetMonthDelta));
          if (upd.day != null) affected.add(donorTargetYm(rowYm, upd.delta));
        }

        for (const ym of affected) {
          // 締切: どの月であれ、締め切った月の割当は動かさない（月を凍結するのが締切の目的）。
          if (!isMakeupEditable(ym, now)) {
            return NextResponse.json({ error: makeupClosedMessage(ym) }, { status: 409 });
          }
          const { year: y, month: m } = parseYm(ym);
          const counts = dayCountsOf(rows, ym);
          const grace = await resolveMakeupCap({
            userId: user.id,
            instanceDomain: user.instance.domain,
            ym,
          });
          const filledHoleSet = filledHolesAfter(rows, ym, counts, makeupUpdates);

          // grace 上限: 新規割当で穴埋め数が grace を超えるなら拒否（他の月は外すだけなので増えない）。
          // （表示・DBともに grace 件までに揃え、「表示上は空きなのに使用中」の食い違いを防ぐ）
          if (ym === targetYm && body.makeupTargetDay !== null && filledHoleSet.size > grace) {
            return NextResponse.json(
              {
                error: isPointEra(ym)
                  ? `穴埋めポイントが足りません（${m}月の穴埋めポイントは${grace}ptです）`
                  // TODO(cleanup-2026-10): docs/cleanup-2026-10.md 参照（従来ルールの文言ごと削除）
                  : `穴埋めは1か月に${grace}日までです`,
              },
              { status: 409 }
            );
          }

          // no-divergence: 達成済み(👑)月を非達成に落とす変更（穴埋めの解除など）は拒否。
          const grantedPerfect = await tx.achievement.findFirst({
            where: { userId: user.id, key: perfectMonthKey(ym) },
            select: { id: true },
          });
          if (
            grantedPerfect &&
            !isPerfectMonth({
              daysInMonth: daysInMonthOf(y, m),
              dayCounts: counts,
              filledHoleDays: [...filledHoleSet],
              grace,
            })
          ) {
            return NextResponse.json(
              {
                error: `${m}月は皆勤賞を達成済みのため、穴埋めを解除できません（別の写真への付け替えは可能です）`,
              },
              { status: 409 }
            );
          }
        }
      }

      // ---- 適用（ロックと同じトランザクション内）----
      for (const [imgId, v] of pickUpdates) {
        await tx.image.update({ where: { id: imgId }, data: { calendarPickedAt: v } });
      }
      for (const [imgId, v] of makeupUpdates) {
        await tx.image.update({
          where: { id: imgId },
          data: { makeupTargetDay: v.day, makeupTargetMonthDelta: v.delta },
        });
      }
      return null;

    });
    if (rejected) return rejected;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to patch image:", error);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserWithValidation();

    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { id } = await params;

    // 画像を取得して所有者確認
    const image = await prisma.image.findUnique({
      where: { id },
    });

    if (!image) {
      return NextResponse.json({ error: "画像が見つかりません" }, { status: 404 });
    }

    if (image.userId !== user.id) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    // S3から削除（元画像とサムネイル）
    try {
      await deleteImage(image.storageKey);
      if (image.thumbnailKey) {
        await deleteImage(image.thumbnailKey);
      }
    } catch (error) {
      console.error("Failed to delete from S3:", error);
      // S3削除に失敗してもDB削除は続行
    }

    // DBから削除
    await prisma.image.delete({
      where: { id },
    });

    // 削除後の穴埋め割当の後始末。画像削除自体は常に成功させる（プライバシー優先）ので失敗は握りつぶす。
    // 👑（Achievement 行）はどちらの経路でも剥奪しない。
    const deletedYm = toJstYm(image.createdAt);
    if (!isPointEra(deletedYm) && user.autoMakeup && isMakeupEditable(deletedYm, new Date())) {
      // 2026-09 以前の月・自動穴埋めON: 従来どおり残りの投稿で月の割当を再計算して別donorで埋め直す。
      // 締切後の月は触らない（締切後に割当が変わると「締切後も穴埋めが動く」ことになるため）。
      // TODO(cleanup-2026-10): docs/cleanup-2026-10.md 参照（この分岐ごと削除し、下の失効掃除だけにする）
      const { year: y, month: m } = parseYm(deletedYm);
      await recomputeMonthMakeups({
        userId: user.id,
        year: y,
        month: m,
        grace: perfectMonthGrace(user.instance.domain),
      }).catch((e) => console.error("Makeup self-heal failed:", e));
    } else {
      // 手動の割当は付け替えず、2枚未満になった日の donor 割当だけを外す（selfHeal.ts 参照）。
      await healAfterImageDelete({ userId: user.id, deletedCreatedAt: image.createdAt }).catch((e) =>
        console.error("Makeup stale donor cleanup failed:", e)
      );
    }

    // 連携先（Mastodon/Misskey）に投稿が残っている場合は、その情報をクライアントに返す。
    // クライアントは「連携先の投稿も削除しますか？」と尋ね、ユーザーが望めば
    // /api/v1/fediverse/delete-status で実際に削除する（ここでは削除しない）。
    let remoteStatus: {
      statusId: string;
      statusUrl: string | null;
      platform: "mastodon" | "misskey";
    } | null = null;
    const type = user.instance.type;
    if (image.postId && (type === "mastodon" || type === "misskey")) {
      try {
        const accessToken = decryptToken(user.accessToken);
        const exists = await fediverseStatusExists(
          type,
          user.instance.domain,
          accessToken,
          image.postId
        );
        if (exists) {
          remoteStatus = {
            statusId: image.postId,
            statusUrl: image.postUrl,
            platform: type,
          };
        }
      } catch (error) {
        // 確認に失敗しても画像削除自体は成功しているので、尋ねずに進める
        console.error("Failed to check remote status:", error);
      }
    }

    return NextResponse.json({ success: true, remoteStatus });
  } catch (error) {
    console.error("Failed to delete image:", error);
    return NextResponse.json(
      { error: "画像の削除に失敗しました" },
      { status: 500 }
    );
  }
}
