/**
 * 国土地理院（GSI）の逆ジオコーダで緯度経度から都道府県＋市区町村を取得する。
 *
 *   https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=...&lon=...
 *
 * APIは5桁ゼロパディングの muniCd を返す（例: "13113"=渋谷区、"01101"=札幌市中央区）。
 * 海外座標や無人地域では {} を返すので、その場合は null を返す。
 *
 * muniCd → {都道府県, 市区町村} のマッピングは scripts/build-muni-codes.ts で生成した
 * 静的JSONを利用する。
 */

import muniCodes from "./muni-codes.json";
import { USER_AGENT } from "@/lib/userAgent";

const ENDPOINT = "https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress";

export interface GeocodedLocation {
  prefecture: string;
  city: string;
}

const TIMEOUT_MS = 5000;

interface MuniCodeEntry {
  prefecture: string;
  city: string;
}

const muniLookup = muniCodes as Record<string, MuniCodeEntry>;

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<GeocodedLocation | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const url = `${ENDPOINT}?lat=${lat}&lon=${lng}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let muniCd: string | null = null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: { muniCd?: string } };
    muniCd = json?.results?.muniCd ?? null;
  } catch (err) {
    console.warn("GSI reverse geocode failed:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!muniCd) return null;

  const entry = muniLookup[muniCd];
  if (!entry) {
    console.warn(`Unknown muniCd from GSI: ${muniCd}`);
    return null;
  }

  return entry;
}
