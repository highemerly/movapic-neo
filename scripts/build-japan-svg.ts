/**
 * Japan TopoJSON を都道府県IDごとのSVGパスに変換する。
 *
 *   npx tsx scripts/build-japan-svg.ts
 *
 * 出力: src/lib/geocode/japan-svg-paths.json
 *
 * - 入力: scripts/japan.topojson (dataofjapan/land を取得して同梱)
 * - 投影: d3.geoMercator を Japan の bounding box にフィット
 * - 出力JSON形式: { viewBox: "0 0 W H", paths: { "01": "M...", "02": "M...", ... } }
 *
 * 都道府県IDはtopojsonの properties.id（1〜47）。JIS X 0402 と同じなので、
 * 出力時に 2桁ゼロパディングのキーに揃える。
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { feature } from "topojson-client";
import { presimplify, simplify } from "topojson-simplify";
import { geoMercator, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { Topology } from "topojson-specification";

const SRC = join(__dirname, "japan.topojson");
const OUT = join(__dirname, "..", "src", "lib", "geocode", "japan-svg-paths.json");

const WIDTH = 800;
const HEIGHT = 800;

const raw = readFileSync(SRC, "utf8");
const topo = JSON.parse(raw) as Topology;

// 頂点を間引いて軽量化（visvalingam重み）。閾値が大きいほど省略される。
// 800x800への投影で目立たない程度の値を選ぶ
const simplified = simplify(presimplify(topo), 0.0008);

// "japan" はキー名（topojsonの objects 内）
const collection = feature(
  simplified,
  simplified.objects.japan
) as unknown as FeatureCollection<Geometry, GeoJsonProperties>;

// 全Featuresを使って投影をbounding boxにfit
const projection = geoMercator().fitSize([WIDTH, HEIGHT], collection);
const pathGen = geoPath(projection);

// パス文字列内の数値を最大1桁に丸めて圧縮（800x800の描画では十分）
function compressPath(d: string): string {
  return d.replace(/(-?\d+\.\d+)/g, (m) => Number(m).toFixed(1));
}

const paths: Record<string, string> = {};
for (const f of collection.features as Feature[]) {
  const id = (f.properties as { id?: number } | null)?.id;
  if (id == null) continue;
  const key = String(id).padStart(2, "0");
  const d = pathGen(f);
  if (d) paths[key] = compressPath(d);
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
      paths,
    },
    null,
    0
  )
);

console.log(`Wrote ${Object.keys(paths).length} prefecture paths to ${OUT}`);
