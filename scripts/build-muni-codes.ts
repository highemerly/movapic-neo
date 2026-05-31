/**
 * GSIのmuni.jsから市区町村コード→{都道府県, 市区町村}のJSONを生成する
 *
 *   curl -sS -o /tmp/gsi-muni.js https://maps.gsi.go.jp/js/muni.js
 *   npx tsx scripts/build-muni-codes.ts
 *
 * 出力: src/lib/geocode/muni-codes.json
 *
 * GSI逆ジオコーダAPIは5桁ゼロパディングのmuniCdを返すため、
 * このJSONのキーも5桁ゼロパディングに揃える（muni.jsの4桁キーは "01101" に変換）。
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const SRC = "/tmp/gsi-muni.js";
const OUT = join(__dirname, "..", "src", "lib", "geocode", "muni-codes.json");

const raw = readFileSync(SRC, "utf8");

// 'GSI.MUNI_ARRAY["1100"] = '1,北海道,1100,札幌市';' のような行をパース
const lineRe = /GSI\.MUNI_ARRAY\["(\d+)"\]\s*=\s*'(\d+),([^,]+),(\d+),([^']+)';/g;

const out: Record<string, { prefecture: string; city: string }> = {};
let match: RegExpExecArray | null;
while ((match = lineRe.exec(raw)) !== null) {
  const [, , , prefName, muniCd, cityRaw] = match;
  const key = muniCd.padStart(5, "0");
  // 政令指定都市は "札幌市　中央区" のように全角スペース区切り → 連結する
  const city = cityRaw.replace(/　/g, "");
  out[key] = { prefecture: prefName, city };
}

writeFileSync(OUT, JSON.stringify(out, null, 0));
console.log(`Wrote ${Object.keys(out).length} entries to ${OUT}`);
