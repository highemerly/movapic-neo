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
import { formatYm, jstMonthRange, parseYm, shiftYm, toJstYm } from "@/lib/jst";
import { resolveMakeupCap, withMonthMakeupLock } from "@/lib/makeup/ledger";
import { MAKEUP_DEADLINE_DAY, isMakeupEditable, isPointEra } from "@/lib/makeup/points";
import { healAfterImageDelete } from "@/lib/makeup/selfHeal";

/** その画像の JST 日(1-31)。 */
function jstDay(createdAt: Date): number {
  return Number(toJstDateString(createdAt).slice(8, 10));
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
      select: { id: true, userId: true, createdAt: true, calendarPickedAt: true, makeupTargetDay: true },
    });
    if (!image) {
      return NextResponse.json({ error: "画像が見つかりません" }, { status: 404 });
    }
    if (image.userId !== user.id) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const jst = toJstDateString(image.createdAt);
    const year = Number(jst.slice(0, 4));
    const month = Number(jst.slice(5, 7));
    const imageDay = Number(jst.slice(8, 10));
    const daysInMonth = daysInMonthOf(year, month);

    const wantsPick = typeof body.calendarPicked === "boolean";
    const wantsMakeup = body.makeupTargetDay !== undefined;
    if (!wantsPick && !wantsMakeup) {
      return NextResponse.json({ error: "更新するフィールドがありません" }, { status: 400 });
    }

    const ym = formatYm(year, month);
    if (wantsMakeup && !isMakeupEditable(ym, new Date())) {
      const deadlineMonth = parseYm(shiftYm(ym, 1)).month;
      return NextResponse.json(
        { error: `${month}月の穴埋めは${deadlineMonth}月${MAKEUP_DEADLINE_DAY}日で締め切りました` },
        { status: 409 }
      );
    }

    // 検証〜適用をユーザー×月で直列化する。検証で弾いたときは NextResponse を返し（書き込みなし）、
    // 通ったときは null を返す。
    const rejected = await withMonthMakeupLock(user.id, ym, async (tx) => {
      // 月の全画像（実績と同じ集合＝isPublic/isDisabledで絞らない）。バリデーション・皆勤判定に使う。
      const { start: monthStart, end: monthEnd } = jstMonthRange(year, month);
      const monthImages = await tx.image.findMany({
        where: { userId: user.id, createdAt: { gte: monthStart, lt: monthEnd } },
        select: { id: true, createdAt: true, makeupTargetDay: true },
      });
      const dayCounts: Record<number, number> = {};
      for (const m of monthImages) {
        const d = jstDay(m.createdAt);
        dayCounts[d] = (dayCounts[d] ?? 0) + 1;
      }

      // 実行する DB 更新（imageId -> 変更内容）をまとめてから1トランザクションで適用する。
      const pickUpdates = new Map<string, Date | null>();
      const makeupUpdates = new Map<string, number | null>();

      // ---- ① 代表（サムネイル）----
      if (wantsPick) {
        if (body.calendarPicked === true) {
          // ①↔②重複: 代表にする画像が donor（穴埋めに使用中）なら不可
          if (image.makeupTargetDay != null || makeupUpdates.get(id) != null) {
            return NextResponse.json(
              { error: "穴埋めに使っている写真は、その日のサムネイルにできません" },
              { status: 409 }
            );
          }
          pickUpdates.set(id, new Date());
          // 1日1代表: 同JST日の他画像の pick を外す
          for (const m of monthImages) {
            if (m.id !== id && jstDay(m.createdAt) === imageDay) pickUpdates.set(m.id, null);
          }
        } else {
          pickUpdates.set(id, null);
        }
      }

      // ---- ② 穴埋め割当（donor）----
      if (wantsMakeup) {
        const target = body.makeupTargetDay;
        if (target === null) {
          makeupUpdates.set(id, null);
        } else {
          if (typeof target !== "number" || !Number.isInteger(target) || target < 1 || target > daysInMonth) {
            return NextResponse.json({ error: "穴埋め先の日付が不正です" }, { status: 400 });
          }
          // 合法性: donorは穴より後・穴は空き日・donor日はダブル投稿・代表ではない
          if (imageDay <= target) {
            return NextResponse.json(
              { error: "穴埋めは、その日より後のダブル投稿でしか埋められません" },
              { status: 409 }
            );
          }
          if ((dayCounts[target] ?? 0) !== 0) {
            return NextResponse.json({ error: "その日には投稿があるため穴埋めできません" }, { status: 409 });
          }
          if ((dayCounts[imageDay] ?? 0) < 2) {
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
          makeupUpdates.set(id, target);
          // 1日1donor: 同JST日の他の donor を外す（この画像が代表donorになる）
          for (const m of monthImages) {
            if (m.id !== id && jstDay(m.createdAt) === imageDay && m.makeupTargetDay != null) {
              makeupUpdates.set(m.id, null);
            }
          }
          // 1穴1donor（再割当）: 同じ穴を埋めている別donorを外す＝別donorへ付替
          for (const m of monthImages) {
            if (m.id !== id && m.makeupTargetDay === target) makeupUpdates.set(m.id, null);
          }
        }
      }

      // ---- 穴埋めまわりのガード（grace 上限 / no-divergence）----
      if (makeupUpdates.size > 0) {
        const grace = await resolveMakeupCap({ userId: user.id, instanceDomain: user.instance.domain, ym });
        // 変更後の filledHoleDays（実在する空き日のみ・distinct）を算出。
        const effective = new Map<string, number | null>(
          monthImages.map((m) => [m.id, m.makeupTargetDay])
        );
        for (const [k, v] of makeupUpdates) effective.set(k, v);
        const filledHoleSet = new Set<number>();
        for (const v of effective.values()) {
          if (v != null && (dayCounts[v] ?? 0) === 0) filledHoleSet.add(v);
        }

        // grace 上限: 新規割当（target != null）で穴埋め数が grace を超えるなら拒否。
        // （表示・DBともに grace 件までに揃え、「表示上は空きなのに使用中」の食い違いを防ぐ）
        const isAssign = wantsMakeup && body.makeupTargetDay !== null;
        if (isAssign && filledHoleSet.size > grace) {
          return NextResponse.json(
            {
              error: isPointEra(ym)
                ? `穴埋めポイントが足りません（${month}月の穴埋めポイントは${grace}ptです）`
                // TODO(cleanup-2026-10): docs/cleanup-2026-10.md 参照（従来ルールの文言ごと削除）
                : `穴埋めは1か月に${grace}日までです`,
            },
            { status: 409 }
          );
        }

        // no-divergence: 達成済み(👑)月を非達成に落とす変更（穴埋めの解除など）は拒否。
        const grantedPerfect = await tx.achievement.findFirst({
          where: { userId: user.id, key: perfectMonthKey(`${year}-${String(month).padStart(2, "0")}`) },
          select: { id: true },
        });
        if (
          grantedPerfect &&
          !isPerfectMonth({ daysInMonth, dayCounts, filledHoleDays: [...filledHoleSet], grace })
        ) {
          return NextResponse.json(
            { error: "この月は皆勤賞を達成済みのため、穴埋めを解除できません（別の写真への付け替えは可能です）" },
            { status: 409 }
          );
        }
      }

      // ---- 適用（ロックと同じトランザクション内）----
      for (const [imgId, v] of pickUpdates) {
        await tx.image.update({ where: { id: imgId }, data: { calendarPickedAt: v } });
      }
      for (const [imgId, v] of makeupUpdates) {
        await tx.image.update({ where: { id: imgId }, data: { makeupTargetDay: v } });
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
