import prisma from "@/lib/db";
import { PREFECTURES } from "@/lib/geocode/prefectures";

/**
 * ユーザーが過去に投稿したことのある位置情報（都道府県／都道府県+市町村）。
 *
 * GPS座標を持たない画像でも、過去に投稿実績のある場所であれば手動で位置を付与できる。
 * その「選択肢の一覧」と「投稿時の検証」を必ず同じDB条件で行うため、両方をここに集約する。
 * 一覧は GET /api/v1/me/locations が、検証は POST /api/v1/post が使う。
 */

// 手動位置選択で対象にする投稿の条件。一覧（getUserPostedLocations）と
// 検証（userHasPostedLocation）で必ず同じ条件を使うこと（一覧に出たのに弾かれる/逆を防ぐ）。
// 非公開（local等）でも本人の実投稿なので対象に含め、無効化された投稿のみ除外する。
const POSTED_WHERE = { isDisabled: false } as const;

// 都道府県名 → JIS X 0402 の並び順インデックス（未知の表記は末尾へ）
const PREF_ORDER = new Map(PREFECTURES.map((p, i) => [p.name, i] as const));
const prefIndex = (name: string) => PREF_ORDER.get(name) ?? PREFECTURES.length;

export interface PostedLocations {
  /** 過去に投稿した都道府県（市町村まで保存した投稿の県も含む） */
  prefectures: string[];
  /** 過去に投稿した都道府県+市町村の組み合わせ */
  cities: { prefecture: string; city: string }[];
}

/**
 * ユーザーの過去投稿から、ユニークな都道府県／都道府県+市町村の一覧を返す。
 * いずれも都道府県コード順（市町村は同一県内で名前順）に並べる。
 */
export async function getUserPostedLocations(
  userId: string,
): Promise<PostedLocations> {
  const rows = await prisma.image.findMany({
    where: { userId, ...POSTED_WHERE, locationPrefecture: { not: null } },
    select: { locationPrefecture: true, locationCity: true },
    distinct: ["locationPrefecture", "locationCity"],
  });

  const prefSet = new Set<string>();
  const cities: { prefecture: string; city: string }[] = [];
  for (const r of rows) {
    const pref = r.locationPrefecture;
    if (!pref) continue;
    // 市町村まで保存した投稿でも、その県は「都道府県のみ」候補に含める
    prefSet.add(pref);
    if (r.locationCity) {
      cities.push({ prefecture: pref, city: r.locationCity });
    }
  }

  const prefectures = [...prefSet].sort((a, b) => prefIndex(a) - prefIndex(b));
  cities.sort((a, b) => {
    const d = prefIndex(a.prefecture) - prefIndex(b.prefecture);
    return d !== 0 ? d : a.city.localeCompare(b.city, "ja");
  });

  return { prefectures, cities };
}

/**
 * 手動指定された位置が、そのユーザーの過去投稿として実在するかを検証する。
 * - city = null: その都道府県の投稿が1件でもあれば true（市町村は問わない）
 * - city 指定:  その都道府県+市町村の組み合わせの投稿があれば true
 * getUserPostedLocations と同じ POSTED_WHERE 条件を使うこと。
 */
export async function userHasPostedLocation(
  userId: string,
  prefecture: string,
  city: string | null,
): Promise<boolean> {
  const count = await prisma.image.count({
    where: {
      userId,
      ...POSTED_WHERE,
      locationPrefecture: prefecture,
      ...(city ? { locationCity: city } : {}),
    },
  });
  return count > 0;
}
