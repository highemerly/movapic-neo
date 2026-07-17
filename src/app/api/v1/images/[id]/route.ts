/**
 * 画像削除エンドポイント
 * DELETE /api/v1/images/:id
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithValidation } from "@/lib/auth/session";
import { deleteImage } from "@/lib/storage/storage";
import { decryptToken } from "@/lib/auth/tokens";
import { fediverseStatusExists } from "@/lib/fediverse/delete";
import prisma from "@/lib/db";
import { toJstDateString } from "@/lib/streak";
import {
  daysInMonthOf,
  isPerfectMonth,
  perfectMonthGrace,
  perfectMonthKey,
} from "@/lib/achievements/perfectMonth";
import { recomputeMonthMakeups } from "@/lib/achievements/makeupAssign";

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

    // 月の全画像（実績と同じ集合＝isPublic/isDisabledで絞らない）。バリデーション・皆勤判定に使う。
    const monthStart = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0));
    const monthEnd = new Date(Date.UTC(year, month, 1, -9, 0, 0));
    const monthImages = await prisma.image.findMany({
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
      const grace = perfectMonthGrace(user.instance.domain);
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
          { error: `穴埋めは1か月に${grace}日までです` },
          { status: 409 }
        );
      }

      // no-divergence: 達成済み(👑)月を非達成に落とす変更（穴埋めの解除など）は拒否。
      const grantedPerfect = await prisma.achievement.findFirst({
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

    // ---- 適用 ----
    const ops = [
      ...[...pickUpdates].map(([imgId, v]) =>
        prisma.image.update({ where: { id: imgId }, data: { calendarPickedAt: v } })
      ),
      ...[...makeupUpdates].map(([imgId, v]) =>
        prisma.image.update({ where: { id: imgId }, data: { makeupTargetDay: v } })
      ),
    ];
    if (ops.length > 0) await prisma.$transaction(ops);

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

    // 削除後の自己修復: autoMakeup ユーザーは、その月の穴埋め割当を残りの投稿で再計算して
    // 別donorで埋め直す（表示を極力保つ）。埋め直せない穴は空きに戻る（👑は剥奪しない）。
    // ③OFF ユーザーの月は手動運用なので触らない。画像削除自体は常に成功させる（プライバシー優先）。
    if (user.autoMakeup) {
      const jst = toJstDateString(image.createdAt);
      await recomputeMonthMakeups({
        userId: user.id,
        year: Number(jst.slice(0, 4)),
        month: Number(jst.slice(5, 7)),
        grace: perfectMonthGrace(user.instance.domain),
      }).catch((e) => console.error("Makeup self-heal failed:", e));
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
